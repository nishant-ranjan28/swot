import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

const YIELD_SYMBOLS = [
  { symbol: '^IRX', label: '13-Week T-Bill', tenor: '3M' },
  { symbol: '^FVX', label: '5-Year Treasury', tenor: '5Y' },
  { symbol: '^TNX', label: '10-Year Treasury', tenor: '10Y' },
];

const FOREX_SYMBOLS = [
  { symbol: 'DX-Y.NYB', label: 'US Dollar Index (DXY)' },
  { symbol: 'USDINR=X', label: 'USD/INR' },
];

function MacroPage() {
  const [yields, setYields] = useState({});
  const [forex, setForex] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

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

    // Grid lines
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.5;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = minY + (i / steps) * (maxY - minY);
      const y = getY(val);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2) + '%', padding.left - 5, y + 3);
    }

    // Draw curve
    ctx.beginPath();
    ctx.strokeStyle = '#3B82F6';
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
      ctx.fillStyle = '#3B82F6';
      ctx.fill();
      ctx.strokeStyle = '#1E3A5F';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#E5E7EB';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.yield.toFixed(2) + '%', p.x, y - 12);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '10px sans-serif';
      ctx.fillText(p.tenor, p.x, h - 10);
    });

    // Title
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('US Treasury Yield Curve', w / 2, 15);

    // Inversion check
    const threeM = yields['^IRX']?.price || 0;
    const tenY = yields['^TNX']?.price || 0;
    if (threeM > 0 && tenY > 0 && threeM > tenY) {
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('INVERTED YIELD CURVE', w / 2, 28);
    }
  }, [yields]);

  useEffect(() => {
    if (!loading) drawYieldCurve();
  }, [loading, drawYieldCurve]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-700 rounded"></div>)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">{error}</div>
      </div>
    );
  }

  const threeM = yields['^IRX']?.price || 0;
  const tenY = yields['^TNX']?.price || 0;
  const isInverted = threeM > 0 && tenY > 0 && threeM > tenY;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Macro Dashboard</h1>
      <p className="text-gray-400 text-sm mb-6">Treasury yields, dollar index, and key macro indicators</p>

      {/* Yield Cards */}
      <h2 className="text-lg font-semibold text-white mb-3">US Treasury Yields</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {YIELD_SYMBOLS.map((y) => {
          const q = yields[y.symbol];
          const price = q?.price || q?.regularMarketPrice || 0;
          const change = q?.change || q?.regularMarketChange || 0;
          const changePct = q?.changePercent || q?.regularMarketChangePercent || 0;
          return (
            <div key={y.symbol} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-xs mb-1">{y.label}</div>
              <div className="text-2xl font-bold text-white">{price ? price.toFixed(2) + '%' : 'N/A'}</div>
              <div className={`text-sm mt-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change >= 0 ? '+' : ''}{change?.toFixed(3) || '0'} ({changePct >= 0 ? '+' : ''}{changePct?.toFixed(2) || '0'}%)
              </div>
            </div>
          );
        })}
      </div>

      {/* Yield Curve Inversion Alert */}
      {isInverted && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
          <div className="text-red-400 font-semibold">Yield Curve Inverted</div>
          <p className="text-red-300 text-sm mt-1">
            The 3-month yield ({threeM.toFixed(2)}%) exceeds the 10-year yield ({tenY.toFixed(2)}%).
            An inverted yield curve has historically been a recession indicator.
          </p>
        </div>
      )}

      {/* Yield Curve Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className="w-full"
          style={{ maxHeight: '300px' }}
        />
      </div>

      {/* Forex / Dollar Index */}
      <h2 className="text-lg font-semibold text-white mb-3">Currency & Dollar Index</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {FOREX_SYMBOLS.map((f) => {
          const q = forex[f.symbol];
          const price = q?.price || q?.regularMarketPrice || 0;
          const change = q?.change || q?.regularMarketChange || 0;
          const changePct = q?.changePercent || q?.regularMarketChangePercent || 0;
          return (
            <div key={f.symbol} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-xs mb-1">{f.label}</div>
              <div className="text-2xl font-bold text-white">{price ? price.toFixed(2) : 'N/A'}</div>
              <div className={`text-sm mt-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change >= 0 ? '+' : ''}{change?.toFixed(3) || '0'} ({changePct >= 0 ? '+' : ''}{changePct?.toFixed(2) || '0'}%)
              </div>
            </div>
          );
        })}
      </div>

      {/* India Rates */}
      <h2 className="text-lg font-semibold text-white mb-3">India Key Rates</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">RBI Repo Rate</div>
          <div className="text-2xl font-bold text-white">6.25%</div>
          <div className="text-gray-500 text-xs mt-1">Last updated: Feb 2025</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">RBI Reverse Repo Rate</div>
          <div className="text-2xl font-bold text-white">3.35%</div>
          <div className="text-gray-500 text-xs mt-1">Standing Deposit Facility</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">CPI Inflation (YoY)</div>
          <div className="text-2xl font-bold text-white">~4.5%</div>
          <div className="text-gray-500 text-xs mt-1">Approximate (static)</div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
        <p className="text-yellow-500 text-xs">
          Note: Yield data is from Yahoo Finance and may be delayed. India rates are static reference values and may not reflect the latest RBI announcements.
        </p>
      </div>
    </div>
  );
}

export default MacroPage;
