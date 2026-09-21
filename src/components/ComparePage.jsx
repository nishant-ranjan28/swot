import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import { cn } from '@/lib/utils';

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
        <Input
          type="text"
          placeholder="Search stock..."
          value={query}
          onChange={handleChange}
          autoComplete="off"
          aria-label="Search stock"
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm p-1.5 text-muted-foreground hover:text-loss transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
            title="Remove stock"
            aria-label="Remove stock"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {results.map((s) => (
            <li key={s.symbol}>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors focus:outline-hidden"
                onClick={() => pick(s)}
              >
                <span className="font-medium">{s.symbol}</span>
                <span className="text-muted-foreground ml-2">{s.name}</span>
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
    <PageContainer>
      <PageHeader
        title="Stock Comparison"
        description="Compare 2-4 stocks side by side on key metrics"
        actions={
          <Link
            to="/"
            className="text-sm font-medium text-foreground dark:text-primary underline-offset-4 hover:underline"
          >
            Back to Home
          </Link>
        }
      />

      {/* Quick Presets */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Compare</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => handlePreset(preset)}
              className="h-auto min-h-8 whitespace-normal py-1.5 text-left"
            >
              <span>
                {preset.label}
                <span className="ml-1 text-xs text-muted-foreground">({preset.symbols.join(', ')})</span>
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Stock Selectors */}
      <div className="relative z-20 rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Select Stocks</p>
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
            <Button variant="ghost" size="sm" onClick={addSlot}>
              <Plus aria-hidden />
              Add Stock
            </Button>
          )}
          <Button onClick={handleCompare} disabled={!canCompare || loading} className="px-6">
            {loading ? 'Comparing...' : 'Compare'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (error.startsWith('Note:') ? (
        <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{error}</div>
      ) : (
        <ErrorState title="Some data could not be loaded" message={error} />
      ))}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" role="status" aria-label="Loading"></div>
        </div>
      )}

      {/* Comparison Table */}
      {hasResults && !loading && (
        <>
        <SectionCard contentClassName="p-0" className="overflow-hidden">
          <Table className="min-w-[600px]">
            {/* Header row with stock names */}
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 bg-card px-4 py-3 h-auto text-xs font-semibold text-muted-foreground uppercase tracking-wide w-40 min-w-[160px]">
                  Metric
                </TableHead>
                {comparedSymbols.map((sym) => {
                  const quote = data[sym]?.quote;
                  return (
                    <TableHead key={sym} className="px-4 py-3 h-auto text-center min-w-[140px]">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          to={`/stock/${sym}`}
                          className="text-foreground hover:underline underline-offset-4 font-bold text-sm focus:outline-hidden"
                        >
                          {sym}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeStockColumn(sym)}
                          className="ml-1 rounded-sm p-0.5 text-muted-foreground hover:text-loss transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                          title="Remove"
                          aria-label={`Remove ${sym}`}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </div>
                      {quote?.name && (
                        <div className="text-[11px] text-muted-foreground font-normal mt-0.5 truncate max-w-[140px] mx-auto">
                          {quote.name}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {METRIC_SECTIONS.map((section) => (
                <React.Fragment key={section.title}>
                  {/* Section header */}
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={comparedSymbols.length + 1}
                      className="sticky left-0 z-10 bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {section.title}
                    </TableCell>
                  </TableRow>

                  {/* Metric rows */}
                  {section.metrics.map((metric) => {
                    const rawValues = comparedSymbols.map((sym) => metric.key(data[sym]));
                    const bestIdx = getBestIndex(rawValues, metric.bestIs);

                    return (
                      <TableRow key={metric.label} className="group">
                        <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-muted px-4 py-2.5 text-sm text-foreground/85 font-medium">
                          {metric.label}
                        </TableCell>
                        {rawValues.map((val, i) => {
                          const isBest = i === bestIdx;
                          return (
                            <TableCell
                              key={comparedSymbols[i]}
                              className={cn(
                                'px-4 py-2.5 text-sm text-center font-medium tabular-nums',
                                isBest && 'bg-gain/10 font-semibold text-gain',
                              )}
                            >
                              {metric.format(val)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>

          {/* Disclaimer */}
          <div className="border-t border-border px-4 py-3 bg-muted/40">
            <p className="text-[11px] text-muted-foreground text-center">
              Green highlights indicate the best value in each row. Data sourced from market feeds and may be delayed.
            </p>
          </div>
        </SectionCard>

        {/* Verdict & Summary */}
        <ComparisonVerdict data={data} symbols={comparedSymbols} />
        </>
      )}
    </PageContainer>
  );
};

// ===== Verdict Component =====
// Category → chart token, in the category order (valuation 1 … momentum 5).
const CAT_COLORS = {
  valuation: { bg: 'bg-chart-1', border: 'border-l-chart-1' },
  profitability: { bg: 'bg-chart-2', border: 'border-l-chart-2' },
  growth: { bg: 'bg-chart-3', border: 'border-l-chart-3' },
  health: { bg: 'bg-chart-4', border: 'border-l-chart-4' },
  momentum: { bg: 'bg-chart-5', border: 'border-l-chart-5' },
};

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
    <div className="space-y-4">
      {/* Winner Banner */}
      <div className="rounded-xl border border-gain/30 bg-gain/5 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-gain font-semibold uppercase tracking-wide mb-1">Overall Winner</div>
            <div className="text-xl font-bold text-foreground">{winner.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Won {winner.wins} out of 13 metric comparisons</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground tabular-nums">₹{winner.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <Link to={`/stock/${winner.sym}`} className="text-xs text-gain font-medium underline-offset-4 hover:underline">
              View detailed analysis →
            </Link>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <SectionCard title="Score Breakdown">
        <div className="space-y-3">
          {ranked.map((stock, idx) => (
            <div key={stock.sym} className="flex items-center gap-3">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                idx === 0 ? 'bg-gain/12 text-gain' : 'bg-muted text-muted-foreground',
              )}>
                {idx + 1}
              </div>
              <div className="w-32 text-sm font-medium truncate">{stock.name}</div>
              <div className="flex-1">
                <div className="h-6 bg-muted rounded-full overflow-hidden flex">
                  {categories.map(cat => {
                    const pct = maxTotal > 0 ? (stock[cat] / maxTotal) * 100 : 0;
                    return pct > 0 ? (
                      <div key={cat} className={cn('h-full', CAT_COLORS[cat].bg)}
                        style={{ width: `${pct}%` }}
                        title={`${catLabels[cat]}: ${stock[cat]} pts`}
                      ></div>
                    ) : null;
                  })}
                </div>
              </div>
              <div className="w-12 text-right text-sm font-bold tabular-nums">{stock.total} pts</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
          {categories.map(cat => (
            <span key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('w-3 h-3 rounded-sm', CAT_COLORS[cat].bg)}></span>
              {catLabels[cat]}
            </span>
          ))}
        </div>
      </SectionCard>

      {/* Category Winners */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {categories.map(cat => {
          const catWinner = [...ranked].sort((a, b) => b[cat] - a[cat])[0];
          return (
            <div key={cat} className={cn('rounded-lg border border-border border-l-2 bg-card p-3 text-center', CAT_COLORS[cat].border)}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{catLabels[cat]}</div>
              <div className="text-sm font-bold mt-1 text-foreground">{catWinner.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{catWinner[cat]} pts</div>
            </div>
          );
        })}
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <SectionCard title="Key Insights">
          <div className="space-y-2">
            {insights.slice(0, 8).map((insight, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className={cn(
                  'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
                  insight.type === 'positive' ? 'bg-gain' : insight.type === 'negative' ? 'bg-loss' : 'bg-warning',
                )}></span>
                <p className="text-sm text-foreground/85">{insight.text}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
        <p className="text-xs text-warning">
          <span className="font-semibold">Disclaimer:</span> This comparison and scoring is algorithmically generated based on publicly available financial metrics. It is not investment advice. Different investors may weight categories differently based on their strategy. Always do your own research.
        </p>
      </div>
    </div>
  );
};

export default ComparePage;
