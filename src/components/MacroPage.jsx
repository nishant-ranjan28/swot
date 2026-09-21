import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import ErrorState from '@/components/common/ErrorState';
import { useChartTheme } from '@/hooks/useChartTheme';
import { cn } from '@/lib/utils';

const YIELD_SYMBOLS = [
  { symbol: '^IRX', label: '13-Week T-Bill', tenor: '3M' },
  { symbol: '^FVX', label: '5-Year Treasury', tenor: '5Y' },
  { symbol: '^TNX', label: '10-Year Treasury', tenor: '10Y' },
];

const FOREX_SYMBOLS = [
  { symbol: 'DX-Y.NYB', label: 'US Dollar Index (DXY)' },
  { symbol: 'USDINR=X', label: 'USD/INR' },
];

const sectionTitleClass = 'mb-3 text-lg font-semibold';

// Change line kept verbatim (3-decimal change, colored by change sign) — PriceChange only formats 2 decimals.
const ChangeLine = ({ change, changePct }) => (
  <div className={cn('mt-0.5 text-xs tabular-nums', change >= 0 ? 'text-gain' : 'text-loss')}>
    {change >= 0 ? '+' : ''}{change?.toFixed(3) || '0'} ({changePct >= 0 ? '+' : ''}{changePct?.toFixed(2) || '0'}%)
  </div>
);

function MacroPage() {
  const [yields, setYields] = useState({});
  const [forex, setForex] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const ct = useChartTheme();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const allSymbols = [...YIELD_SYMBOLS.map(y => y.symbol), ...FOREX_SYMBOLS.map(f => f.symbol)];
        const res = await api.get(`/api/stocks/batch?symbols=${allSymbols.join(',')}`);
        const quotes = res.data.quotes || {};

        const yieldData = {};
        const forexData = {};

        Object.entries(quotes).forEach(([sym, q]) => {
          if (!q) return;
          if (YIELD_SYMBOLS.find(y => y.symbol === sym)) {
            yieldData[sym] = q;
          }
          if (FOREX_SYMBOLS.find(f => f.symbol === sym)) {
            forexData[sym] = q;
          }
        });

        setYields(yieldData);
        setForex(forexData);
      } catch (err) {
        setError('Failed to fetch macro data');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const drawYieldCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padding = { top: 30, right: 30, bottom: 40, left: 50 };

    ctx.clearRect(0, 0, w, h);

    const points = YIELD_SYMBOLS.map((y, i) => {
      const q = yields[y.symbol];
      return {
        tenor: y.tenor,
        yield: q?.price || 0,
        x: padding.left + (i / (YIELD_SYMBOLS.length - 1)) * (w - padding.left - padding.right),
      };
    }).filter(p => p.yield > 0);

    if (points.length === 0) return;

    const minY = Math.min(...points.map(p => p.yield)) - 0.5;
    const maxY = Math.max(...points.map(p => p.yield)) + 0.5;
    const chartH = h - padding.top - padding.bottom;

    const getY = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

    const lineColor = ct.isDark ? ct.primary : ct.foreground;

    // Grid lines
    ctx.strokeStyle = ct.grid;
    ctx.lineWidth = 0.5;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = minY + (i / steps) * (maxY - minY);
      const y = getY(val);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = ct.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2) + '%', padding.left - 5, y + 3);
    }

    // Draw curve
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    points.forEach((p, i) => {
      const y = getY(p.yield);
      if (i === 0) ctx.moveTo(p.x, y);
      else ctx.lineTo(p.x, y);
    });
    ctx.stroke();

    // Draw points
    points.forEach((p) => {
      const y = getY(p.yield);
      ctx.beginPath();
      ctx.arc(p.x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.strokeStyle = ct.background;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = ct.foreground;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.yield.toFixed(2) + '%', p.x, y - 12);
      ctx.fillStyle = ct.text;
      ctx.font = '10px sans-serif';
      ctx.fillText(p.tenor, p.x, h - 10);
    });

    // Title
    ctx.fillStyle = ct.foreground;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('US Treasury Yield Curve', w / 2, 15);

    // Inversion check
    const threeM = yields['^IRX']?.price || 0;
    const tenY = yields['^TNX']?.price || 0;
    if (threeM > 0 && tenY > 0 && threeM > tenY) {
      ctx.fillStyle = ct.loss;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('INVERTED YIELD CURVE', w / 2, 28);
    }
  }, [yields, ct]);

  useEffect(() => {
    if (!loading) drawYieldCurve();
  }, [loading, drawYieldCurve]);

  if (loading) {
    return (
      <PageContainer className="max-w-6xl">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer className="max-w-6xl">
        <ErrorState title={error} />
      </PageContainer>
    );
  }

  const threeM = yields['^IRX']?.price || 0;
  const tenY = yields['^TNX']?.price || 0;
  const isInverted = threeM > 0 && tenY > 0 && threeM > tenY;

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader title="Macro Dashboard" description="Treasury yields, dollar index, and key macro indicators" />

      {/* Yield Cards */}
      <section>
        <h2 className={sectionTitleClass}>US Treasury Yields</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {YIELD_SYMBOLS.map((y) => {
            const q = yields[y.symbol];
            const price = q?.price || q?.regularMarketPrice || 0;
            const change = q?.change || q?.regularMarketChange || 0;
            const changePct = q?.changePercent || q?.regularMarketChangePercent || 0;
            return (
              <StatCard key={y.symbol} label={y.label} value={price ? price.toFixed(2) + '%' : 'N/A'}>
                <ChangeLine change={change} changePct={changePct} />
              </StatCard>
            );
          })}
        </div>
      </section>

      {/* Yield Curve Inversion Alert */}
      {isInverted && (
        <div role="status" className="flex gap-3 rounded-lg border border-loss/30 bg-loss/5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden />
          <div>
            <div className="font-semibold text-loss">Yield Curve Inverted</div>
            <p className="mt-1 text-sm text-foreground/85">
              The 3-month yield ({threeM.toFixed(2)}%) exceeds the 10-year yield ({tenY.toFixed(2)}%).
              An inverted yield curve has historically been a recession indicator.
            </p>
          </div>
        </div>
      )}

      {/* Yield Curve Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className="w-full"
          style={{ maxHeight: '300px' }}
        />
      </div>

      {/* Forex / Dollar Index */}
      <section>
        <h2 className={sectionTitleClass}>Currency &amp; Dollar Index</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FOREX_SYMBOLS.map((f) => {
            const q = forex[f.symbol];
            const price = q?.price || q?.regularMarketPrice || 0;
            const change = q?.change || q?.regularMarketChange || 0;
            const changePct = q?.changePercent || q?.regularMarketChangePercent || 0;
            return (
              <StatCard key={f.symbol} label={f.label} value={price ? price.toFixed(2) : 'N/A'}>
                <ChangeLine change={change} changePct={changePct} />
              </StatCard>
            );
          })}
        </div>
      </section>

      {/* India Rates */}
      <section>
        <h2 className={sectionTitleClass}>India Key Rates</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="RBI Repo Rate" value="6.25%" sub="Last updated: Feb 2025" />
          <StatCard label="RBI Reverse Repo Rate" value="3.35%" sub="Standing Deposit Facility" />
          <StatCard label="CPI Inflation (YoY)" value="~4.5%" sub="Approximate (static)" />
        </div>
      </section>

      {/* Disclaimer */}
      <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground/85">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        <p>
          Note: Yield data is from Yahoo Finance and may be delayed. India rates are static reference values and may not reflect the latest RBI announcements.
        </p>
      </div>
    </PageContainer>
  );
}

export default MacroPage;
