import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../api';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import PriceChange from '@/components/common/PriceChange';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useChartTheme } from '@/hooks/useChartTheme';
import { withAlpha } from '@/lib/color';
import { cn } from '@/lib/utils';

const formatCr = (val) => {
  if (val == null) return '-';
  const abs = Math.abs(val);
  return `${val >= 0 ? '+' : '-'}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
};

function FiiDiiPage() {
  const [data, setData] = useState(null);
  const [fiiDii, setFiiDii] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const ct = useChartTheme();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [histRes, fiiRes] = await Promise.all([
          api.get('/api/stocks/NIFTYBEES.NS/history?range=1mo'),
          api.get('/api/stocks/fii-dii').catch(() => ({ data: null })),
        ]);
        setData(histRes.data);
        setFiiDii(fiiRes.data);
      } catch (err) {
        setError('Failed to fetch market data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getInterpretation = useCallback(() => {
    if (!data || !data.data || data.data.length < 5) return null;
    const prices = data.data;
    const recent = prices.slice(-5);
    const older = prices.slice(0, -5);

    const avgVolRecent = recent.reduce((s, p) => s + (p.volume || 0), 0) / recent.length;
    const avgVolOlder = older.length > 0
      ? older.reduce((s, p) => s + (p.volume || 0), 0) / older.length
      : avgVolRecent;

    const priceChange = recent[recent.length - 1].close - recent[0].close;
    const volumeAboveAvg = avgVolRecent > avgVolOlder * 1.1;

    if (volumeAboveAvg && priceChange > 0) {
      return { text: 'Institutional buying pressure appears strong', color: 'text-gain', bg: 'bg-gain/10' };
    } else if (volumeAboveAvg && priceChange < 0) {
      return { text: 'Institutional selling pressure appears elevated', color: 'text-loss', bg: 'bg-loss/10' };
    } else if (!volumeAboveAvg && priceChange > 0) {
      return { text: 'Market rising on low volume - cautious optimism', color: 'text-warning', bg: 'bg-warning/10' };
    } else {
      return { text: 'Market appears range-bound with normal activity', color: 'text-muted-foreground', bg: 'bg-muted/40' };
    }
  }, [data]);

  const drawChart = useCallback(() => {
    if (!data || !data.data || data.data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const prices = data.data;
    const w = canvas.width;
    const h = canvas.height;
    const padding = { top: 30, right: 20, bottom: 40, left: 60 };

    ctx.clearRect(0, 0, w, h);

    // Calculate daily changes
    const changes = prices.map((p, i) => ({
      date: p.date,
      change: i > 0 ? ((p.close - prices[i - 1].close) / prices[i - 1].close) * 100 : 0,
      volume: p.volume || 0,
    })).slice(1);

    if (changes.length === 0) return;

    const maxChange = Math.max(...changes.map(c => Math.abs(c.change)), 1);
    const maxVol = Math.max(...changes.map(c => c.volume), 1);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.max(chartW / changes.length - 2, 3);

    // Draw grid
    ctx.strokeStyle = ct.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH / 2);
    ctx.lineTo(w - padding.right, padding.top + chartH / 2);
    ctx.stroke();

    // Draw zero line label
    ctx.fillStyle = ct.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('0%', padding.left - 5, padding.top + chartH / 2 + 3);

    // Draw bars
    changes.forEach((c, i) => {
      const x = padding.left + (i / changes.length) * chartW;
      const midY = padding.top + chartH / 2;

      // Volume bars (background, half height)
      const volH = (c.volume / maxVol) * (chartH / 2) * 0.5;
      ctx.fillStyle = withAlpha(ct.text, 0.3);
      ctx.fillRect(x, midY + chartH / 2 - volH - padding.bottom + 40, barW, volH);

      // Price change bars
      const changeH = (Math.abs(c.change) / maxChange) * (chartH / 2 - 5);
      if (c.change >= 0) {
        ctx.fillStyle = ct.gain;
        ctx.fillRect(x, midY - changeH, barW, changeH);
      } else {
        ctx.fillStyle = ct.loss;
        ctx.fillRect(x, midY, barW, changeH);
      }
    });

    // Labels
    ctx.fillStyle = ct.text;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Daily % Change (green=up, red=down) | Gray=Volume', w / 2, h - 5);

    // Date labels
    ctx.fillStyle = ct.text;
    ctx.font = '9px sans-serif';
    const step = Math.max(Math.floor(changes.length / 6), 1);
    for (let i = 0; i < changes.length; i += step) {
      const x = padding.left + (i / changes.length) * chartW + barW / 2;
      const label = changes[i].date ? changes[i].date.slice(5) : '';
      ctx.fillText(label, x, h - 20);
    }
  }, [data, ct]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  if (loading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  const prices = data?.data || [];
  const latest = prices[prices.length - 1];
  const prev = prices.length > 1 ? prices[prices.length - 2] : latest;
  const dayChange = latest && prev ? ((latest.close - prev.close) / prev.close * 100).toFixed(2) : 0;
  const avgVol = prices.length > 0
    ? prices.reduce((s, p) => s + (p.volume || 0), 0) / prices.length
    : 0;
  const latestVol = latest?.volume || 0;
  const volRatio = avgVol > 0 ? (latestVol / avgVol).toFixed(2) : 'N/A';
  const interpretation = getInterpretation();

  const flowTone = (net) => (net >= 0 ? 'text-gain' : 'text-loss');

  return (
    <PageContainer>
      <PageHeader
        title="FII/DII Flow Tracker (Proxy)"
        description="Institutional flow indicators based on NIFTY ETF (NIFTYBEES.NS) volume and price action"
      />

      {/* Daily Summary Card */}
      {/* Real FII/DII Data from NSE */}
      {fiiDii && (fiiDii.fii || fiiDii.dii) && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Today's FII/DII Activity ({fiiDii.date || 'Latest'})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FII/FPI */}
            {fiiDii.fii && (
              <StatCard
                label={<span title="Foreign Institutional Investors">FII / FPI</span>}
                value={<span className={flowTone(fiiDii.fii.net)}>{formatCr(fiiDii.fii.net)}</span>}
                sub="Net flow"
                className={fiiDii.fii.net >= 0 ? 'border-gain/30' : 'border-loss/30'}
              >
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Buy</div>
                    <div className="text-sm font-semibold tabular-nums text-gain">{formatCr(fiiDii.fii.buy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Sell</div>
                    <div className="text-sm font-semibold tabular-nums text-loss">{formatCr(-fiiDii.fii.sell)}</div>
                  </div>
                </div>
                <div className={cn('mt-2 text-xs font-medium', flowTone(fiiDii.fii.net))}>
                  {fiiDii.fii.net >= 0 ? 'Net Buyers — Bullish signal' : 'Net Sellers — Bearish signal'}
                </div>
              </StatCard>
            )}
            {/* DII */}
            {fiiDii.dii && (
              <StatCard
                label={<span title="Domestic Institutional Investors">DII</span>}
                value={<span className={flowTone(fiiDii.dii.net)}>{formatCr(fiiDii.dii.net)}</span>}
                sub="Net flow"
                className={fiiDii.dii.net >= 0 ? 'border-gain/30' : 'border-loss/30'}
              >
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Buy</div>
                    <div className="text-sm font-semibold tabular-nums text-gain">{formatCr(fiiDii.dii.buy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Sell</div>
                    <div className="text-sm font-semibold tabular-nums text-loss">{formatCr(-fiiDii.dii.sell)}</div>
                  </div>
                </div>
                <div className={cn('mt-2 text-xs font-medium', flowTone(fiiDii.dii.net))}>
                  {fiiDii.dii.net >= 0 ? 'Net Buyers — Supporting market' : 'Net Sellers'}
                </div>
              </StatCard>
            )}
          </div>
          {/* Net Summary Bar */}
          {fiiDii.fii && fiiDii.dii && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-2">Combined Net Flow</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden flex">
                  {fiiDii.fii.net < 0 && (
                    <div className="h-full bg-loss/70" style={{ width: `${Math.min(Math.abs(fiiDii.fii.net) / (Math.abs(fiiDii.fii.net) + Math.abs(fiiDii.dii.net)) * 100, 100)}%` }}></div>
                  )}
                  {fiiDii.dii.net > 0 && (
                    <div className="h-full bg-gain/70 ml-auto" style={{ width: `${Math.min(Math.abs(fiiDii.dii.net) / (Math.abs(fiiDii.fii.net) + Math.abs(fiiDii.dii.net)) * 100, 100)}%` }}></div>
                  )}
                </div>
                <div className={cn('text-sm font-semibold tabular-nums', flowTone(fiiDii.fii.net + fiiDii.dii.net))}>
                  Net: {formatCr(fiiDii.fii.net + fiiDii.dii.net)}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* NIFTY ETF Proxy Indicators */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">NIFTY ETF Volume Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="NIFTYBEES Daily Change"
            value={
              <span className={parseFloat(dayChange) >= 0 ? 'text-gain' : 'text-loss'}>
                {parseFloat(dayChange) >= 0 ? '+' : ''}{dayChange}%
              </span>
            }
            sub={`Close: ${latest?.close?.toFixed(2)}`}
          />
          <StatCard
            label="Volume vs 30D Avg"
            value={
              <span className={parseFloat(volRatio) > 1.1 ? 'text-foreground' : 'text-muted-foreground'}>
                {volRatio}x
              </span>
            }
            sub={`Today: ${(latestVol / 1e6).toFixed(2)}M | Avg: ${(avgVol / 1e6).toFixed(2)}M`}
          />
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Market Breadth Signal</div>
            {interpretation && (
              <div className={cn('text-base font-semibold', interpretation.color)}>
                {interpretation.text}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Interpretation Banner */}
      {interpretation && (
        <div className={cn(interpretation.bg, 'rounded-xl border border-border p-4')}>
          <div className="flex items-center gap-2">
            <span className={cn('text-lg', interpretation.color)} aria-hidden>
              {interpretation.text.includes('buying') ? '\u2191' : interpretation.text.includes('selling') ? '\u2193' : '\u2194'}
            </span>
            <span className={cn('font-medium', interpretation.color)}>{interpretation.text}</span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Based on 5-day volume trend relative to 30-day average and price direction
          </p>
        </div>
      )}

      {/* 30-Day Trend Chart */}
      <SectionCard title="30-Day Trend">
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="w-full"
          style={{ maxHeight: '300px' }}
        />
      </SectionCard>

      {/* Recent Data Table */}
      <SectionCard title="Recent Sessions" contentClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4 text-muted-foreground">Date</TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">Close</TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">Change %</TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">Volume</TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">Vol vs Avg</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.slice(-10).reverse().map((p, i) => {
              const prevP = prices[prices.indexOf(p) - 1];
              const chg = prevP ? ((p.close - prevP.close) / prevP.close * 100).toFixed(2) : '-';
              const vRatio = avgVol > 0 ? ((p.volume || 0) / avgVol).toFixed(2) : '-';
              return (
                <TableRow key={i}>
                  <TableCell className="px-4 tabular-nums">{p.date}</TableCell>
                  <TableCell className="px-4 text-right tabular-nums">{p.close?.toFixed(2)}</TableCell>
                  <TableCell className="px-4 text-right">
                    {chg !== '-' ? <PriceChange percent={parseFloat(chg)} /> : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums">
                    {p.volume ? (p.volume / 1e6).toFixed(2) + 'M' : '-'}
                  </TableCell>
                  <TableCell className={cn('px-4 text-right tabular-nums', parseFloat(vRatio) > 1.1 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    {vRatio}x
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-xs text-muted-foreground">
          Note: Actual FII/DII data requires NSDL/SEBI feeds. This shows proxy indicators based on NIFTY ETF volume and price action.
        </p>
      </div>
    </PageContainer>
  );
}

export default FiiDiiPage;
