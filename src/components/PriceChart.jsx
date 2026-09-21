import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useChartTheme } from '@/hooks/useChartTheme';
import { withAlpha } from '@/lib/color';
import { segmentClass } from '@/lib/segment';
import { Skeleton } from '@/components/ui/skeleton';

const PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
];

/**
 * Reusable price chart with period selector.
 * @param {string} symbol - Yahoo Finance symbol
 * @param {string} title - Chart title
 * @param {number} [decimals=2] - Decimal places for Y-axis labels
 */
function PriceChart({ symbol, title, decimals = 2 }) {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('3mo');
  const ct = useChartTheme();

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/api/stocks/${encodeURIComponent(symbol)}/history`, { params: { range: period } })
      .then(res => {
        if (!cancelled) setChartData(Array.isArray(res.data.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load chart data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [symbol, period]);

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
    const margin = decimals >= 4 ? 0.001 : 0.005;
    const minP = Math.min(...closes) * (1 - margin);
    const maxP = Math.max(...closes) * (1 + margin);
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
      ctx.fillText(val.toFixed(decimals), pad.left - 5, y + 3);
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    const isUp = closes[closes.length - 1] >= closes[0];
    const lineColor = isUp ? ct.gain : ct.loss;
    gradient.addColorStop(0, withAlpha(lineColor, 0.15));
    gradient.addColorStop(1, withAlpha(lineColor, 0));

    const gap = cW / (closes.length - 1);

    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = pad.left + gap * i;
      const y = pad.top + ((maxP - c) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = pad.left + gap * (closes.length - 1);
    ctx.lineTo(lastX, pad.top + cH);
    ctx.lineTo(pad.left, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = pad.left + gap * i;
      const y = pad.top + ((maxP - c) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // X-axis date labels
    ctx.fillStyle = ct.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, chartData.length);
    const step = Math.floor(chartData.length / labelCount);
    for (let i = 0; i < chartData.length; i += step) {
      const x = pad.left + gap * i;
      const d = chartData[i].date || chartData[i].Date || '';
      const label = d.length > 10 ? d.substring(0, 10) : d;
      ctx.fillText(label, x, H - 8);
    }
  }, [chartData, decimals, ct]);

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div role="group" aria-label="Chart period" className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={segmentClass(period === p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="rounded-lg border border-border bg-card p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-loss">
          {error}
        </div>
      )}
      {!loading && !error && chartData && chartData.length > 0 && (
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-border bg-card"
          style={{ height: '320px' }}
        />
      )}
    </div>
  );
}

export default PriceChart;
