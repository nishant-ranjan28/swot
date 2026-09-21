import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';
import { useChartTheme } from '@/hooks/useChartTheme';
import { AlertTriangle } from 'lucide-react';
import StatCard from '@/components/common/StatCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const headClass = 'text-xs uppercase tracking-wide text-muted-foreground';

const DAY_OPTIONS = [7, 14, 30];

const PredictionTab = ({ symbol }) => {
  const [days, setDays] = useState(7);
  const { data, loading, error, refetch } = useStockData(
    `/api/stocks/${symbol}/predict?days=${days}`
  );
  const { currency } = useMarket();
  const canvasRef = useRef(null);
  const ct = useChartTheme();

  const locale = currency === '$' ? 'en-US' : 'en-IN';
  const fmtPrice = (val) =>
    val != null
      ? `${currency}${val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '-';

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const predictions = data.predictions || [];
    if (predictions.length === 0 || !data.current_price) return;

    // Build data points: current price + predictions
    const currentPrice = data.current_price || 0;
    const allPrices = [currentPrice, ...predictions.map((p) => p.predicted_price || 0)].filter(p => p != null);
    const labels = ['Current', ...predictions.map((p) => p.date.slice(5))]; // MM-DD

    const minPrice = Math.min(...allPrices) * 0.995;
    const maxPrice = Math.max(...allPrices) * 1.005;
    const priceRange = maxPrice - minPrice || 1;

    const padL = 60;
    const padR = 20;
    const padT = 20;
    const padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const xStep = chartW / (allPrices.length - 1 || 1);
    const getX = (i) => padL + i * xStep;
    const getY = (price) => padT + chartH - ((price - minPrice) / priceRange) * chartH;

    // Grid lines
    ctx.strokeStyle = ct.grid;
    ctx.lineWidth = 0.5;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();

      // Y-axis labels
      const price = maxPrice - (priceRange / gridLines) * i;
      ctx.fillStyle = ct.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(2), padL - 6, y + 3);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = ct.text;
    ctx.font = '10px sans-serif';
    const labelStep = Math.max(1, Math.floor(labels.length / 8));
    labels.forEach((label, i) => {
      if (i % labelStep === 0 || i === labels.length - 1) {
        ctx.fillText(label, getX(i), H - padB + 18);
      }
    });

    // Current price point (solid dot)
    ctx.fillStyle = ct.isDark ? ct.primary : ct.foreground;
    ctx.beginPath();
    ctx.arc(getX(0), getY(currentPrice), 5, 0, Math.PI * 2);
    ctx.fill();

    // Predicted prices (dashed line)
    const predColor = data.direction === 'Bullish' ? ct.gain : data.direction === 'Neutral' ? ct.text : ct.loss;
    ctx.strokeStyle = predColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(currentPrice));
    for (let i = 1; i < allPrices.length; i++) {
      ctx.lineTo(getX(i), getY(allPrices[i]));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Predicted price dots
    ctx.fillStyle = predColor;
    for (let i = 1; i < allPrices.length; i++) {
      ctx.beginPath();
      ctx.arc(getX(i), getY(allPrices[i]), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Current price label
    ctx.fillStyle = ct.isDark ? ct.primary : ct.foreground;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Current: ${currentPrice.toFixed(2)}`, getX(0) + 8, getY(currentPrice) - 8);

    // End price label
    const endPrice = allPrices[allPrices.length - 1];
    ctx.fillStyle = predColor;
    ctx.textAlign = 'right';
    ctx.fillText(endPrice.toFixed(2), getX(allPrices.length - 1) - 8, getY(endPrice) - 8);
  }, [data, ct]);

  useEffect(() => {
    drawChart();
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  if (loading) return <TabSkeleton rows={8} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No prediction data available for this stock." />;

  const dirColor = data.direction === 'Bullish' ? 'text-gain' : data.direction === 'Neutral' ? 'text-muted-foreground' : 'text-loss';
  const dirTint = data.direction === 'Bullish' ? 'border-gain/30 bg-gain/5' : data.direction === 'Neutral' ? '' : 'border-loss/30 bg-loss/5';
  const changeSign = data.predicted_change_pct >= 0 ? '+' : '';

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
        <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-foreground">Disclaimer</p>
          <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
        </div>
      </div>

      {/* Day Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground font-medium">Prediction Period:</span>
        <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Prediction period">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                days === d
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Direction Badge + Model Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Direction */}
        <StatCard
          label="Direction"
          value={<span className={dirColor}>{data.direction}</span>}
          className={dirTint}
        >
          <p className={cn('mt-0.5 text-xs font-medium tabular-nums', dirColor)}>
            {changeSign}{data.predicted_change_pct}%
          </p>
        </StatCard>

        {/* Model */}
        <StatCard label="Model" value={data.model}>
          <p className="mt-0.5 text-xs text-muted-foreground">
            R&sup2; Accuracy: <span className="font-semibold tabular-nums text-foreground">{data.model_accuracy}%</span>
          </p>
        </StatCard>

        {/* MAPE */}
        <StatCard label="MAPE" value={`${data.mape}%`} sub="Mean Absolute % Error" />
      </div>

      {/* Prediction Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Price Prediction Chart</h2>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: '300px' }}
        />
        <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-foreground dark:bg-primary" /> Current Price
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-8 border-t-2 border-dashed" style={{ borderColor: data.direction === 'Bullish' ? ct.gain : data.direction === 'Neutral' ? ct.text : ct.loss }} />
            Predicted ({data.direction})
          </span>
        </div>
      </div>

      {/* Prediction Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground px-4 py-3 border-b border-border">
          Day-by-Day Predictions
        </h2>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Date</TableHead>
                <TableHead className={`text-right ${headClass}`}>Predicted Price</TableHead>
                <TableHead className={`text-right ${headClass}`}>Change from Current</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.predictions || []).map((p, idx) => {
                const diff = (p.predicted_price || 0) - (data.current_price || 0);
                const diffPct = data.current_price ? ((diff / data.current_price) * 100).toFixed(2) : '0.00';
                const isUp = diff >= 0;
                return (
                  <TableRow key={idx}>
                    <TableCell className="text-foreground/85 tabular-nums">{p.date}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {fmtPrice(p.predicted_price)}
                    </TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', isUp ? 'text-gain' : 'text-loss')}>
                      {isUp ? '+' : ''}{diffPct}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Current Price Footer */}
      <div className="text-center text-sm text-muted-foreground">
        Current Price: <span className="font-semibold tabular-nums text-foreground">{fmtPrice(data.current_price)}</span>
      </div>
    </div>
  );
};

export default PredictionTab;
