import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../api';
import { useMarket } from '../context/MarketContext';

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

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function EquityChart({ data, initialCash }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || data.length < 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
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
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const val = maxE - (range / 4) * i;
      ctx.fillStyle = '#999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toLocaleString(undefined, { maximumFractionDigits: 0 }), pad.left - 5, y + 3);
    }

    // Initial cash line
    const cashY = pad.top + ((maxE - initialCash) / range) * cH;
    ctx.strokeStyle = '#ddd';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, cashY);
    ctx.lineTo(W - pad.right, cashY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Equity line
    const finalEquity = equities[equities.length - 1];
    const lineColor = finalEquity >= initialCash ? '#22c55e' : '#ef4444';
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
    ctx.fillStyle = finalEquity >= initialCash ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
    ctx.fill();

    // X-axis labels
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, data.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / (labelCount - 1)) * (data.length - 1));
      const x = pad.left + (idx / (data.length - 1)) * cW;
      ctx.fillText(data[idx].date, x, H - 5);
    }
  }, [data, initialCash]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Equity Curve</h3>
      <canvas ref={canvasRef} style={{ width: '100%', height: 250 }} />
    </div>
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
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Strategy Backtester</h1>
      <p className="text-sm text-gray-500 mb-6">Test trading strategies against historical data</p>

      {/* Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Symbol Search */}
          <div className="relative lg:col-span-2" ref={dropdownRef}>
            <label className="block text-xs text-gray-500 font-medium mb-1">Stock Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={handleSymbolChange}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="Search stock..."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectStock(r.symbol)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <span className="font-medium text-gray-900">{r.symbol}</span>
                    {r.name && <span className="text-gray-500 ml-2 text-xs">{r.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Period</label>
            <div className="flex gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    period === p.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Initial Capital</label>
            <input
              type="number"
              value={cash}
              onChange={(e) => setCash(parseFloat(e.target.value) || 100000)}
              min={10000}
              max={10000000}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Quick Stocks */}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400">Quick:</span>
          {(POPULAR_STOCKS[market] || POPULAR_STOCKS.in).map(s => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Run Button */}
        <button
          onClick={runBacktest}
          disabled={!symbol || loading}
          className="mt-4 w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Running Backtest...' : 'Run Backtest'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-500">Running backtest on {symbol}...</p>
          <p className="text-xs text-gray-400 mt-1">This may take a few seconds</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{result.symbol} - {result.strategy}</h2>
              <p className="text-xs text-gray-500">Period: {result.period} | Trades: {result.total_trades}</p>
            </div>
            {result.total_trades > 0 && (
              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                strategyWins ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {strategyWins ? 'Strategy Beats Buy & Hold' : 'Buy & Hold Wins'}
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard
              label="Final Equity"
              value={formatCurrency(result.final_equity, currency)}
              color={result.final_equity >= result.initial_cash ? 'text-green-600' : 'text-red-600'}
            />
            <SummaryCard
              label="Total Return"
              value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`}
              color={result.total_return_pct >= 0 ? 'text-green-600' : 'text-red-600'}
            />
            <SummaryCard
              label="Buy & Hold"
              value={`${result.buy_hold_return_pct >= 0 ? '+' : ''}${result.buy_hold_return_pct}%`}
              color={result.buy_hold_return_pct >= 0 ? 'text-green-600' : 'text-red-600'}
            />
            <SummaryCard
              label="Max Drawdown"
              value={`${result.max_drawdown_pct}%`}
              color="text-red-600"
            />
            <SummaryCard
              label="Sharpe Ratio"
              value={result.sharpe_ratio != null ? result.sharpe_ratio : 'N/A'}
              color={result.sharpe_ratio > 1 ? 'text-green-600' : result.sharpe_ratio > 0 ? 'text-yellow-600' : 'text-red-600'}
            />
            <SummaryCard
              label="Win Rate"
              value={`${result.win_rate_pct}%`}
              color={result.win_rate_pct >= 50 ? 'text-green-600' : 'text-red-600'}
            />
          </div>

          {/* Extra Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Avg Trade" value={`${result.avg_trade_pct}%`} />
            <SummaryCard label="Best Trade" value={`${result.best_trade_pct}%`} color="text-green-600" />
            <SummaryCard label="Worst Trade" value={`${result.worst_trade_pct}%`} color="text-red-600" />
            <SummaryCard label="Profit Factor" value={result.profit_factor != null ? result.profit_factor : 'N/A'} />
          </div>

          {/* Equity Curve */}
          {result.equity_curve && result.equity_curve.length > 1 && (
            <EquityChart data={result.equity_curve} initialCash={result.initial_cash} />
          )}

          {/* Trade Log */}
          {result.trades && result.trades.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => setShowTrades(!showTrades)}
                className="w-full px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <span>Trade Log ({result.trades.length} trades)</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showTrades ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showTrades && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Entry Date</th>
                        <th className="px-3 py-2 text-left font-medium">Exit Date</th>
                        <th className="px-3 py-2 text-right font-medium">Entry Price</th>
                        <th className="px-3 py-2 text-right font-medium">Exit Price</th>
                        <th className="px-3 py-2 text-right font-medium">P&L</th>
                        <th className="px-3 py-2 text-right font-medium">Return %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              t.type === 'Long' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {t.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{t.entry_date?.slice(0, 10)}</td>
                          <td className="px-3 py-2 text-gray-600">{t.exit_date?.slice(0, 10)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{t.entry_price}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{t.exit_price}</td>
                          <td className={`px-3 py-2 text-right font-medium ${t.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {t.pnl >= 0 ? '+' : ''}{t.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${t.return_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {t.return_pct >= 0 ? '+' : ''}{t.return_pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
            <strong>Disclaimer:</strong> Backtesting results are based on historical data and do not guarantee future performance.
            Past performance is not indicative of future results. Trading involves risk, and you may lose more than your initial investment.
            This tool is for educational purposes only and should not be considered as financial advice.
          </div>
        </div>
      )}
    </div>
  );
}

export default BacktestPage;
