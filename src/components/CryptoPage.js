import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

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

function formatChange(pct) {
  if (pct == null) return '-';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// Loading skeleton rows
function SkeletonRows({ count }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-8" /></td>
      <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
      <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-24" /></td>
      <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
      <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-20" /></td>
      <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
    </tr>
  ));
}

function CryptoChart({ symbol, timeframe, limit }) {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      ctx.strokeStyle = bullish ? '#22c55e' : '#ef4444';
      ctx.fillStyle = bullish ? '#22c55e' : '#ef4444';

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Body
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(Math.abs(closeY - openY), 1);
      if (bullish) {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
      } else {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyH);
      }
    });

    // X-axis date labels
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, chartData.length);
    const step = Math.floor(chartData.length / labelCount);
    for (let i = 0; i < chartData.length; i += step) {
      const x = pad.left + gap * i + gap / 2;
      ctx.fillText(chartData[i].date, x, H - 8);
    }

    // Close price line overlay
    ctx.strokeStyle = '#3b82f6';
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
  }, [chartData]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <div className="animate-pulse">
          <div className="h-64 bg-gray-100 rounded" />
        </div>
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

  if (!chartData || chartData.length === 0) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full bg-white rounded-lg border border-gray-200"
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
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crypto Market</h1>
          <p className="text-sm text-gray-500 mt-1">Top 15 cryptocurrencies by 24h volume (prices update every 60s)</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchPrices(); }}
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

      {/* Crypto Prices Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-left font-semibold text-gray-600">#</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Name</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Price (USD)</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">24h Change</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">24h Volume</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">24h High / Low</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows count={15} />
              ) : cryptos.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-8 text-center text-gray-500">
                    No crypto data available
                  </td>
                </tr>
              ) : (
                cryptos.map((c, idx) => {
                  const isPositive = (c.change_pct_24h || 0) >= 0;
                  const isSelected = selected?.symbol === c.symbol;
                  return (
                    <tr
                      key={c.symbol}
                      onClick={() => setSelected(c)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        <span className="font-bold">{c.name}</span>
                        <span className="text-gray-400 text-xs ml-1">/USDT</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium text-gray-900">
                        {formatPrice(c.price)}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {formatChange(c.change_pct_24h)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">
                        {formatVolume(c.volume_24h)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 text-xs">
                        <span className="text-green-600">{formatPrice(c.high_24h)}</span>
                        {' / '}
                        <span className="text-red-600">{formatPrice(c.low_24h)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart Section */}
      {selected && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">
              {selected.name}/USDT Chart
            </h2>
            <div className="flex gap-1">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    timeframe === tf.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
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
      <div className="text-xs text-gray-400 text-center mt-6">
        Data sourced from Binance via CCXT. Prices are for informational purposes only and may be delayed.
        Not financial advice.
      </div>
    </div>
  );
}

export default CryptoPage;
