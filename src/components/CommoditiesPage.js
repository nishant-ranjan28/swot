import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

const COMMODITIES = [
  { symbol: 'GC=F', name: 'Gold', unit: 'oz' },
  { symbol: 'SI=F', name: 'Silver', unit: 'oz' },
  { symbol: 'CL=F', name: 'Crude Oil', unit: 'bbl' },
  { symbol: 'NG=F', name: 'Natural Gas', unit: 'MMBtu' },
  { symbol: 'HG=F', name: 'Copper', unit: 'lb' },
];

const PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
];

function CommodityChart({ symbol, period }) {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/api/stocks/${encodeURIComponent(symbol)}/history`, { params: { period } })
      .then(res => {
        if (!cancelled) setChartData(res.data.history || res.data);
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
    const minP = Math.min(...closes) * 0.995;
    const maxP = Math.max(...closes) * 1.005;
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
      ctx.fillText(`$${val.toFixed(2)}`, pad.left - 5, y + 3);
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
  }, [chartData]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <div className="animate-pulse"><div className="h-64 bg-gray-100 rounded" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-red-500">
        {error}
      </div>
    );
  }

  if (!chartData || chartData.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="w-full bg-white rounded-lg border border-gray-200"
      style={{ height: '320px' }}
    />
  );
}

function CommoditiesPage() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [period, setPeriod] = useState('3mo');

  const fetchQuotes = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all(
      COMMODITIES.map(c =>
        api.get(`/api/stocks/${encodeURIComponent(c.symbol)}/quote`)
          .then(res => ({ symbol: c.symbol, data: res.data }))
          .catch(() => ({ symbol: c.symbol, data: null }))
      )
    ).then(results => {
      const map = {};
      results.forEach(r => { if (r.data) map[r.symbol] = r.data; });
      setQuotes(map);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load commodity prices.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commodities</h1>
          <p className="text-sm text-gray-500 mt-1">Live prices for major commodities (USD)</p>
        </div>
        <button
          onClick={fetchQuotes}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Commodity Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {COMMODITIES.map(c => {
          const q = quotes[c.symbol];
          const isSelected = selected === c.symbol;
          const price = q?.price || q?.regularMarketPrice || 0;
          const changePct = q?.change_percent ?? q?.regularMarketChangePercent ?? 0;
          const change = q?.change ?? q?.regularMarketChange ?? 0;
          const isPositive = changePct >= 0;

          return (
            <button
              key={c.symbol}
              type="button"
              onClick={() => setSelected(isSelected ? null : c.symbol)}
              className={`rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md text-left ${
                isSelected
                  ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                  : 'bg-white border-gray-100'
              }`}
            >
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
                  <div className="h-5 bg-gray-200 rounded w-20 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-14" />
                </div>
              ) : (
                <>
                  <div className="text-sm text-gray-500 font-medium">{c.name}</div>
                  <div className="text-xl font-bold text-gray-900 mt-1">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">per {c.unit}</div>
                  <div className={`text-sm font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Chart Section */}
      {selected && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">
              {COMMODITIES.find(c => c.symbol === selected)?.name} Price Chart
            </h2>
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
          <CommodityChart symbol={selected} period={period} />
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-gray-400 text-center mt-6">
        Data sourced from Yahoo Finance. Prices are for informational purposes only and may be delayed.
        Not financial advice.
      </div>
    </div>
  );
}

export default CommoditiesPage;
