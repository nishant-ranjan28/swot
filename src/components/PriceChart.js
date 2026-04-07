import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

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
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const val = maxP - (range / 4) * i;
      ctx.fillStyle = '#999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(decimals), pad.left - 5, y + 3);
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    const isUp = closes[closes.length - 1] >= closes[0];
    gradient.addColorStop(0, isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

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
    ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444';
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
    ctx.fillStyle = '#999';
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
  }, [chartData, decimals]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <div className="animate-pulse"><div className="h-64 bg-gray-100 rounded" /></div>
        </div>
      )}
      {error && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-red-500">
          {error}
        </div>
      )}
      {!loading && !error && chartData && chartData.length > 0 && (
        <canvas
          ref={canvasRef}
          className="w-full bg-white rounded-lg border border-gray-200"
          style={{ height: '320px' }}
        />
      )}
    </div>
  );
}

export default PriceChart;
