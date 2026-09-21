import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import PriceChange from '@/components/common/PriceChange';
import ErrorState from '@/components/common/ErrorState';
import { useChartTheme } from '@/hooks/useChartTheme';
import { withAlpha } from '@/lib/color';
import { cn } from '@/lib/utils';
import { selectClass } from '@/lib/select';

const STRATEGIES = [
  { value: 'sma_crossover', label: 'SMA Crossover' },
  { value: 'rsi', label: 'RSI Strategy' },
];

const PERIODS = [
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];

const POPULAR_STOCKS = {
  in: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'SBIN.NS'],
  us: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
};

function formatCurrency(value, currency) {
  if (value == null) return '-';
  const sym = currency === 'INR' ? '\u20B9' : '$';
  return `${sym}${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TH_CLASS = 'px-3 text-xs font-medium text-muted-foreground';

function SummaryCard({ label, value, color }) {
  return <StatCard label={label} value={<span className={color}>{value}</span>} />;
}

function EquityChart({ data, initialCash }) {
  const canvasRef = useRef(null);
  const ct = useChartTheme();

  useEffect(() => {
    if (!data || data.length < 2) return;
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

    const equities = data.map(d => d.equity);
    const minE = Math.min(...equities) * 0.98;
    const maxE = Math.max(...equities) * 1.02;
    const range = maxE - minE || 1;

    const pad = { top: 20, right: 20, bottom: 30, left: 60 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = ct.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const val = maxE - (range / 4) * i;
      ctx.fillStyle = ct.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toLocaleString(undefined, { maximumFractionDigits: 0 }), pad.left - 5, y + 3);
    }

    // Initial cash line
    const cashY = pad.top + ((maxE - initialCash) / range) * cH;
    ctx.strokeStyle = withAlpha(ct.text, 0.5);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, cashY);
    ctx.lineTo(W - pad.right, cashY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Equity line
    const finalEquity = equities[equities.length - 1];
    const lineColor = finalEquity >= initialCash ? ct.gain : ct.loss;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = pad.left + (i / (data.length - 1)) * cW;
      const y = pad.top + ((maxE - d.equity) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under the curve
    const lastX = pad.left + cW;
    const baseY = pad.top + cH;
    ctx.lineTo(lastX, baseY);
    ctx.lineTo(pad.left, baseY);
    ctx.closePath();
    ctx.fillStyle = withAlpha(finalEquity >= initialCash ? ct.gain : ct.loss, 0.08);
    ctx.fill();

    // X-axis labels
    ctx.fillStyle = ct.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, data.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / (labelCount - 1)) * (data.length - 1));
      const x = pad.left + (idx / (data.length - 1)) * cW;
      ctx.fillText(data[idx].date, x, H - 5);
    }
  }, [data, initialCash, ct]);

  return (
    <SectionCard title="Equity Curve">
      <canvas ref={canvasRef} style={{ width: '100%', height: 250 }} />
    </SectionCard>
  );
}

function BacktestPage() {
  const { market } = useMarket();
  const currency = market === 'us' ? 'USD' : 'INR';
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState('sma_crossover');
  const [period, setPeriod] = useState('2y');
  const [cash, setCash] = useState(100000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showTrades, setShowTrades] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeout = useRef(null);
  const dropdownRef = useRef(null);

  const handleSearch = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    try {
      const { data } = await api.get(`/api/stocks/search?q=${encodeURIComponent(query)}&market=${market}`);
      setSearchResults(data.results || []);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    }
  }, [market]);

  const handleSymbolChange = (e) => {
    const val = e.target.value.toUpperCase();
    setSymbol(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(val), 300);
  };

  const selectStock = (sym) => {
    setSymbol(sym);
    setShowDropdown(false);
    setSearchResults([]);
  };

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

  const runBacktest = async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.get(`/api/backtest/${encodeURIComponent(symbol)}`, {
        params: { strategy, period, cash },
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run backtest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strategyWins = result && result.total_return_pct > result.buy_hold_return_pct;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Strategy Backtester" description="Test trading strategies against historical data" />

      {/* Controls */}
      <SectionCard>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Symbol Search */}
          <div className="relative lg:col-span-2" ref={dropdownRef}>
            <label htmlFor="bt-symbol" className="block text-xs font-medium text-muted-foreground mb-1">Stock Symbol</label>
            <Input
              id="bt-symbol"
              type="text"
              value={symbol}
              onChange={handleSymbolChange}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="Search stock..."
              autoComplete="off"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-40 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectStock(r.symbol)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="font-medium">{r.symbol}</span>
                    {r.name && <span className="text-muted-foreground ml-2 text-xs">{r.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Strategy */}
          <div>
            <label htmlFor="bt-strategy" className="block text-xs font-medium text-muted-foreground mb-1">Strategy</label>
            <select
              id="bt-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className={cn(selectClass, 'w-full')}
            >
              {STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1">Period</span>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Period">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={period === p.value}
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    'flex-1 rounded-md py-1 text-xs font-medium transition-colors',
                    period === p.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash */}
          <div>
            <label htmlFor="bt-cash" className="block text-xs font-medium text-muted-foreground mb-1">Initial Capital</label>
            <Input
              id="bt-cash"
              type="number"
              value={cash}
              onChange={(e) => setCash(parseFloat(e.target.value) || 100000)}
              min={10000}
              max={10000000}
              className="tabular-nums"
            />
          </div>
        </div>

        {/* Quick Stocks */}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Quick:</span>
          {(POPULAR_STOCKS[market] || POPULAR_STOCKS.in).map(s => (
            <Button
              key={s}
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => setSymbol(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        {/* Run Button */}
        <Button
          type="button"
          onClick={runBacktest}
          disabled={!symbol || loading}
          className="mt-4 w-full sm:w-auto"
        >
          {loading ? 'Running Backtest...' : 'Run Backtest'}
        </Button>
      </SectionCard>

      {/* Error */}
      {error && <ErrorState title="Backtest failed" message={error} />}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <Loader2 className="mx-auto mb-3 size-8 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Running backtest on {symbol}...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take a few seconds</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold">{result.symbol} - {result.strategy}</h2>
              <p className="text-xs text-muted-foreground tabular-nums">Period: {result.period} | Trades: {result.total_trades}</p>
            </div>
            {result.total_trades > 0 && (
              <Badge variant={strategyWins ? 'gain' : 'loss'} className="px-3 py-1 font-semibold">
                {strategyWins ? 'Strategy Beats Buy & Hold' : 'Buy & Hold Wins'}
              </Badge>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard
              label="Final Equity"
              value={formatCurrency(result.final_equity, currency)}
              color={result.final_equity >= result.initial_cash ? 'text-gain' : 'text-loss'}
            />
            <StatCard label="Total Return" value={<PriceChange percent={result.total_return_pct} />} />
            <StatCard label="Buy & Hold" value={<PriceChange percent={result.buy_hold_return_pct} />} />
            <SummaryCard
              label="Max Drawdown"
              value={`${result.max_drawdown_pct}%`}
              color="text-loss"
            />
            <SummaryCard
              label="Sharpe Ratio"
              value={result.sharpe_ratio != null ? result.sharpe_ratio : 'N/A'}
              color={result.sharpe_ratio > 1 ? 'text-gain' : result.sharpe_ratio > 0 ? 'text-warning' : 'text-loss'}
            />
            <SummaryCard
              label="Win Rate"
              value={`${result.win_rate_pct}%`}
              color={result.win_rate_pct >= 50 ? 'text-gain' : 'text-loss'}
            />
          </div>

          {/* Extra Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Avg Trade" value={`${result.avg_trade_pct}%`} />
            <SummaryCard label="Best Trade" value={`${result.best_trade_pct}%`} color="text-gain" />
            <SummaryCard label="Worst Trade" value={`${result.worst_trade_pct}%`} color="text-loss" />
            <SummaryCard label="Profit Factor" value={result.profit_factor != null ? result.profit_factor : 'N/A'} />
          </div>

          {/* Equity Curve */}
          {result.equity_curve && result.equity_curve.length > 1 && (
            <EquityChart data={result.equity_curve} initialCash={result.initial_cash} />
          )}

          {/* Trade Log */}
          {result.trades && result.trades.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                aria-expanded={showTrades}
                onClick={() => setShowTrades(!showTrades)}
                className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-muted/50 flex items-center justify-between transition-colors"
              >
                <span>Trade Log ({result.trades.length} trades)</span>
                <ChevronDown
                  className={cn('size-4 text-muted-foreground transition-transform', showTrades && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {showTrades && (
                <div className="border-t border-border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className={TH_CLASS}>#</TableHead>
                        <TableHead className={TH_CLASS}>Type</TableHead>
                        <TableHead className={TH_CLASS}>Entry Date</TableHead>
                        <TableHead className={TH_CLASS}>Exit Date</TableHead>
                        <TableHead className={cn(TH_CLASS, 'text-right')}>Entry Price</TableHead>
                        <TableHead className={cn(TH_CLASS, 'text-right')}>Exit Price</TableHead>
                        <TableHead className={cn(TH_CLASS, 'text-right')}>P&L</TableHead>
                        <TableHead className={cn(TH_CLASS, 'text-right')}>Return %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.trades.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="px-3 text-muted-foreground/70 tabular-nums">{i + 1}</TableCell>
                          <TableCell className="px-3">
                            <Badge variant={t.type === 'Long' ? 'gain' : 'loss'} className="rounded-sm px-1.5 text-[10px]">
                              {t.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 text-muted-foreground tabular-nums">{t.entry_date?.slice(0, 10)}</TableCell>
                          <TableCell className="px-3 text-muted-foreground tabular-nums">{t.exit_date?.slice(0, 10)}</TableCell>
                          <TableCell className="px-3 text-right tabular-nums text-foreground/85">{t.entry_price}</TableCell>
                          <TableCell className="px-3 text-right tabular-nums text-foreground/85">{t.exit_price}</TableCell>
                          <TableCell className={cn('px-3 text-right font-medium tabular-nums', t.pnl >= 0 ? 'text-gain' : 'text-loss')}>
                            {t.pnl >= 0 ? '+' : ''}{t.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-3 text-right font-medium">
                            <PriceChange percent={t.return_pct} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" aria-hidden />
            <p>
              <strong className="text-foreground">Disclaimer:</strong> Backtesting results are based on historical data and do not guarantee future performance.
              Past performance is not indicative of future results. Trading involves risk, and you may lose more than your initial investment.
              This tool is for educational purposes only and should not be considered as financial advice.
            </p>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export default BacktestPage;
