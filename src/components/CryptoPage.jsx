import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import PriceChange from '@/components/common/PriceChange';
import ErrorState from '@/components/common/ErrorState';
import { useChartTheme } from '@/hooks/useChartTheme';
import { cn } from '@/lib/utils';
import { segmentClass } from '@/lib/segment';

const TIMEFRAMES = [
  { value: '1h', label: '1H', limit: 60 },
  { value: '4h', label: '4H', limit: 90 },
  { value: '1d', label: '1D', limit: 90 },
  { value: '1w', label: '1W', limit: 52 },
];

function formatVolume(vol) {
  if (vol == null) return '-';
  if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatPrice(price) {
  if (price == null) return '-';
  if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(6)}`;
}

const headClass = 'px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

// Loading skeleton rows
function SkeletonRows({ count }) {
  return Array.from({ length: count }).map((_, i) => (
    <TableRow key={i} className="hover:bg-transparent">
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-8" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="ml-auto h-4 w-32" /></TableCell>
    </TableRow>
  ));
}

function CryptoChart({ symbol, timeframe, limit }) {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ct = useChartTheme();

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const base = symbol.split('/')[0];
    api.get(`/api/crypto/chart/${base}`, { params: { timeframe, limit } })
      .then(res => {
        if (!cancelled) setChartData(res.data.data);
      })
      .catch(err => {
        if (!cancelled) setError('Failed to load chart data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [symbol, timeframe, limit]);

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

    const closes = chartData.map(d => d.close);
    const highs = chartData.map(d => d.high);
    const lows = chartData.map(d => d.low);
    const allPrices = [...highs, ...lows];
    const minP = Math.min(...allPrices) * 0.99;
    const maxP = Math.max(...allPrices) * 1.01;
    const range = maxP - minP || 1;

    const pad = { top: 20, right: 20, bottom: 30, left: 70 };
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
      const val = maxP - (range / 4) * i;
      ctx.fillStyle = ct.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(val).replace('$', ''), pad.left - 5, y + 3);
    }

    // Candlestick rendering
    const candleWidth = Math.max(2, (cW / chartData.length) * 0.6);
    const gap = cW / chartData.length;

    chartData.forEach((d, i) => {
      const x = pad.left + gap * i + gap / 2;
      const openY = pad.top + ((maxP - d.open) / range) * cH;
      const closeY = pad.top + ((maxP - d.close) / range) * cH;
      const highY = pad.top + ((maxP - d.high) / range) * cH;
      const lowY = pad.top + ((maxP - d.low) / range) * cH;

      const bullish = d.close >= d.open;
      ctx.strokeStyle = bullish ? ct.gain : ct.loss;
      ctx.fillStyle = bullish ? ct.gain : ct.loss;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Body
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(Math.abs(closeY - openY), 1);
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
    });

    // X-axis date labels
    ctx.fillStyle = ct.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, chartData.length);
    const step = Math.floor(chartData.length / labelCount);
    for (let i = 0; i < chartData.length; i += step) {
      const x = pad.left + gap * i + gap / 2;
      ctx.fillText(chartData[i].date, x, H - 8);
    }

    // Close price line overlay
    ctx.strokeStyle = ct.isDark ? ct.primary : ct.foreground;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = pad.left + gap * i + gap / 2;
      const y = pad.top + ((maxP - c) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [chartData, ct]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-loss">
        {error}
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-xl border border-border bg-card"
      style={{ height: '320px' }}
    />
  );
}

function CryptoPage() {
  const [cryptos, setCryptos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [timeframe, setTimeframe] = useState('1d');

  const fetchPrices = useCallback(() => {
    setError(null);
    api.get('/api/crypto/prices')
      .then(res => {
        setCryptos(res.data.cryptos || []);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load crypto prices. Please try again.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const selectedTf = TIMEFRAMES.find(t => t.value === timeframe);

  return (
    <PageContainer>
      <PageHeader
        title="Crypto Market"
        description="Top 15 cryptocurrencies by 24h volume (prices update every 60s)"
        actions={
          <Button size="sm" onClick={() => { setLoading(true); fetchPrices(); }}>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        }
      />

      {error && <ErrorState title={error} onRetry={() => { setLoading(true); fetchPrices(); }} />}

      {/* Crypto Prices Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={headClass}>#</TableHead>
              <TableHead className={headClass}>Name</TableHead>
              <TableHead className={cn(headClass, 'text-right')}>Price (USD)</TableHead>
              <TableHead className={cn(headClass, 'text-right')}>24h Change</TableHead>
              <TableHead className={cn(headClass, 'text-right')}>24h Volume</TableHead>
              <TableHead className={cn(headClass, 'text-right')}>24h High / Low</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonRows count={15} />
            ) : cryptos.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No crypto data available
                </TableCell>
              </TableRow>
            ) : (
              cryptos.map((c, idx) => {
                const isSelected = selected?.symbol === c.symbol;
                return (
                  <TableRow
                    key={c.symbol}
                    onClick={() => setSelected(c)}
                    data-state={isSelected ? 'selected' : undefined}
                    className="cursor-pointer"
                  >
                    <TableCell className="px-3 py-3 text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                    <TableCell className="px-3 py-3 font-medium">
                      <span className="font-bold">{c.name}</span>
                      <span className="ml-1 text-xs text-muted-foreground">/USDT</span>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono font-medium tabular-nums">
                      {formatPrice(c.price)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono font-medium">
                      <PriceChange percent={c.change_pct_24h} />
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-muted-foreground tabular-nums">
                      {formatVolume(c.volume_24h)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      <span className="text-gain">{formatPrice(c.high_24h)}</span>
                      {' / '}
                      <span className="text-loss">{formatPrice(c.low_24h)}</span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Chart Section */}
      {selected && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {selected.name}/USDT Chart
            </h2>
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Timeframe">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  type="button"
                  aria-pressed={timeframe === tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={segmentClass(timeframe === tf.value)}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <CryptoChart
            symbol={selected.symbol}
            timeframe={timeframe}
            limit={selectedTf?.limit || 90}
          />
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs text-muted-foreground">
        Data sourced from Binance via CCXT. Prices are for informational purposes only and may be delayed.
        Not financial advice.
      </p>
    </PageContainer>
  );
}

export default CryptoPage;
