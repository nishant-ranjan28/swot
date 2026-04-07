import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

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
      return { text: 'Institutional buying pressure appears strong', color: 'text-green-400', bg: 'bg-green-900/30' };
    } else if (volumeAboveAvg && priceChange < 0) {
      return { text: 'Institutional selling pressure appears elevated', color: 'text-red-400', bg: 'bg-red-900/30' };
    } else if (!volumeAboveAvg && priceChange > 0) {
      return { text: 'Market rising on low volume - cautious optimism', color: 'text-yellow-400', bg: 'bg-yellow-900/30' };
    } else {
      return { text: 'Market appears range-bound with normal activity', color: 'text-gray-400', bg: 'bg-gray-700/50' };
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
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH / 2);
    ctx.lineTo(w - padding.right, padding.top + chartH / 2);
    ctx.stroke();

    // Draw zero line label
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('0%', padding.left - 5, padding.top + chartH / 2 + 3);

    // Draw bars
    changes.forEach((c, i) => {
      const x = padding.left + (i / changes.length) * chartW;
      const midY = padding.top + chartH / 2;

      // Volume bars (background, half height)
      const volH = (c.volume / maxVol) * (chartH / 2) * 0.5;
      ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
      ctx.fillRect(x, midY + chartH / 2 - volH - padding.bottom + 40, barW, volH);

      // Price change bars
      const changeH = (Math.abs(c.change) / maxChange) * (chartH / 2 - 5);
      if (c.change >= 0) {
        ctx.fillStyle = '#10B981';
        ctx.fillRect(x, midY - changeH, barW, changeH);
      } else {
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(x, midY, barW, changeH);
      }
    });

    // Labels
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Daily % Change (green=up, red=down) | Gray=Volume', w / 2, h - 5);

    // Date labels
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '9px sans-serif';
    const step = Math.max(Math.floor(changes.length / 6), 1);
    for (let i = 0; i < changes.length; i += step) {
      const x = padding.left + (i / changes.length) * chartW + barW / 2;
      const label = changes[i].date ? changes[i].date.slice(5) : '';
      ctx.fillText(label, x, h - 20);
    }
  }, [data]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          <div className="h-40 bg-gray-700 rounded"></div>
          <div className="h-60 bg-gray-700 rounded"></div>
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">FII/DII Flow Tracker (Proxy)</h1>
      <p className="text-gray-400 text-sm mb-6">
        Institutional flow indicators based on NIFTY ETF (NIFTYBEES.NS) volume and price action
      </p>

      {/* Daily Summary Card */}
      {/* Real FII/DII Data from NSE */}
      {fiiDii && (fiiDii.fii || fiiDii.dii) && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Today's FII/DII Activity ({fiiDii.date || 'Latest'})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FII/FPI */}
            {fiiDii.fii && (
              <div className={`rounded-xl p-5 border ${fiiDii.fii.net >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-sm font-semibold text-gray-700 mb-3">FII / FPI (Foreign Institutional Investors)</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Buy</div>
                    <div className="text-sm font-bold text-green-600">{formatCr(fiiDii.fii.buy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Sell</div>
                    <div className="text-sm font-bold text-red-600">{formatCr(-fiiDii.fii.sell)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Net</div>
                    <div className={`text-lg font-bold ${fiiDii.fii.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCr(fiiDii.fii.net)}
                    </div>
                  </div>
                </div>
                <div className={`mt-2 text-xs font-medium ${fiiDii.fii.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fiiDii.fii.net >= 0 ? 'Net Buyers — Bullish signal' : 'Net Sellers — Bearish signal'}
                </div>
              </div>
            )}
            {/* DII */}
            {fiiDii.dii && (
              <div className={`rounded-xl p-5 border ${fiiDii.dii.net >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-sm font-semibold text-gray-700 mb-3">DII (Domestic Institutional Investors)</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Buy</div>
                    <div className="text-sm font-bold text-green-600">{formatCr(fiiDii.dii.buy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Sell</div>
                    <div className="text-sm font-bold text-red-600">{formatCr(-fiiDii.dii.sell)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Net</div>
                    <div className={`text-lg font-bold ${fiiDii.dii.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCr(fiiDii.dii.net)}
                    </div>
                  </div>
                </div>
                <div className={`mt-2 text-xs font-medium ${fiiDii.dii.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fiiDii.dii.net >= 0 ? 'Net Buyers — Supporting market' : 'Net Sellers'}
                </div>
              </div>
            )}
          </div>
          {/* Net Summary Bar */}
          {fiiDii.fii && fiiDii.dii && (
            <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-500 mb-2">Combined Net Flow</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                  {fiiDii.fii.net < 0 && (
                    <div className="h-full bg-red-400" style={{ width: `${Math.min(Math.abs(fiiDii.fii.net) / (Math.abs(fiiDii.fii.net) + Math.abs(fiiDii.dii.net)) * 100, 100)}%` }}></div>
                  )}
                  {fiiDii.dii.net > 0 && (
                    <div className="h-full bg-green-400 ml-auto" style={{ width: `${Math.min(Math.abs(fiiDii.dii.net) / (Math.abs(fiiDii.fii.net) + Math.abs(fiiDii.dii.net)) * 100, 100)}%` }}></div>
                  )}
                </div>
                <div className={`text-sm font-bold ${(fiiDii.fii.net + fiiDii.dii.net) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Net: {formatCr(fiiDii.fii.net + fiiDii.dii.net)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NIFTY ETF Proxy Indicators */}
      <h2 className="text-lg font-semibold text-gray-800 mb-3">NIFTY ETF Volume Analysis</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-gray-500 text-xs mb-1">NIFTYBEES Daily Change</div>
          <div className={`text-2xl font-bold ${parseFloat(dayChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {parseFloat(dayChange) >= 0 ? '+' : ''}{dayChange}%
          </div>
          <div className="text-gray-500 text-xs mt-1">
            Close: {latest?.close?.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">Volume vs 30D Avg</div>
          <div className={`text-2xl font-bold ${parseFloat(volRatio) > 1.1 ? 'text-blue-400' : 'text-gray-300'}`}>
            {volRatio}x
          </div>
          <div className="text-gray-500 text-xs mt-1">
            Today: {(latestVol / 1e6).toFixed(2)}M | Avg: {(avgVol / 1e6).toFixed(2)}M
          </div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">Market Breadth Signal</div>
          {interpretation && (
            <div className={`text-lg font-semibold ${interpretation.color}`}>
              {interpretation.text}
            </div>
          )}
        </div>
      </div>

      {/* Interpretation Banner */}
      {interpretation && (
        <div className={`${interpretation.bg} border border-gray-700 rounded-lg p-4 mb-6`}>
          <div className="flex items-center gap-2">
            <span className={`text-lg ${interpretation.color}`}>
              {interpretation.text.includes('buying') ? '\u2191' : interpretation.text.includes('selling') ? '\u2193' : '\u2194'}
            </span>
            <span className={`font-medium ${interpretation.color}`}>{interpretation.text}</span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Based on 5-day volume trend relative to 30-day average and price direction
          </p>
        </div>
      )}

      {/* 30-Day Trend Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">30-Day Trend</h2>
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="w-full"
          style={{ maxHeight: '300px' }}
        />
      </div>

      {/* Recent Data Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">Recent Sessions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 py-2 px-3">Date</th>
                <th className="text-right text-gray-400 py-2 px-3">Close</th>
                <th className="text-right text-gray-400 py-2 px-3">Change %</th>
                <th className="text-right text-gray-400 py-2 px-3">Volume</th>
                <th className="text-right text-gray-400 py-2 px-3">Vol vs Avg</th>
              </tr>
            </thead>
            <tbody>
              {prices.slice(-10).reverse().map((p, i) => {
                const prevP = prices[prices.indexOf(p) - 1];
                const chg = prevP ? ((p.close - prevP.close) / prevP.close * 100).toFixed(2) : '-';
                const vRatio = avgVol > 0 ? ((p.volume || 0) / avgVol).toFixed(2) : '-';
                return (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-2 px-3 text-gray-300">{p.date}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{p.close?.toFixed(2)}</td>
                    <td className={`py-2 px-3 text-right ${parseFloat(chg) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {chg !== '-' ? `${parseFloat(chg) >= 0 ? '+' : ''}${chg}%` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {p.volume ? (p.volume / 1e6).toFixed(2) + 'M' : '-'}
                    </td>
                    <td className={`py-2 px-3 text-right ${parseFloat(vRatio) > 1.1 ? 'text-blue-400' : 'text-gray-400'}`}>
                      {vRatio}x
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
        <p className="text-yellow-500 text-xs">
          Note: Actual FII/DII data requires NSDL/SEBI feeds. This shows proxy indicators based on NIFTY ETF volume and price action.
        </p>
      </div>
    </div>
  );
}

export default FiiDiiPage;
