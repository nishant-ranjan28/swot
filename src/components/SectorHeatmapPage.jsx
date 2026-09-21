import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';

const formatMarketCap = (value) => {
  if (!value) return 'N/A';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString();
};

const getChangeColor = (change, alpha = 1) => {
  if (change > 3) return `rgba(22, 163, 74, ${alpha})`;
  if (change > 1.5) return `rgba(34, 197, 94, ${alpha})`;
  if (change > 0) return `rgba(134, 239, 172, ${alpha})`;
  if (change === 0) return `rgba(156, 163, 175, ${alpha})`;
  if (change > -1.5) return `rgba(252, 165, 165, ${alpha})`;
  if (change > -3) return `rgba(239, 68, 68, ${alpha})`;
  return `rgba(185, 28, 28, ${alpha})`;
};

const getTextColor = (change) => {
  if (Math.abs(change) > 1) return '#ffffff';
  return '#1f2937';
};

const SkeletonHeatmap = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    {[...Array(10)].map((_, i) => (
      <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-28"></div>
    ))}
  </div>
);

const SectorHeatmapPage = () => {
  const { market } = useMarket();
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('heatmap');
  const canvasRef = useRef(null);

  useEffect(() => {
    const fetchSectors = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/stocks/sector-performance?market=${market}`);
        setSectors(res.data.sectors || []);
      } catch (err) {
        setError('Failed to load sector performance data. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSectors();
  }, [market]);

  // Canvas-based treemap
  const drawTreemap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || sectors.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 3;

    // Sort sectors by market cap for treemap layout
    const sorted = [...sectors].sort((a, b) => (b.total_market_cap || 0) - (a.total_market_cap || 0));
    // Simple squarified treemap layout
    const rects = [];
    let x = 0, y = 0, remainingW = width, remainingH = height;
    let remaining = [...sorted];

    /* eslint-disable no-loop-func */
    while (remaining.length > 0) {
      const isHorizontal = remainingW >= remainingH;
      const remainingMcap = remaining.reduce((s, r) => s + (r.total_market_cap || 1), 0);

      // Find the best row
      let bestRow = [remaining[0]];
      let bestRatio = Infinity;

      for (let i = 1; i <= remaining.length; i++) {
        const row = remaining.slice(0, i);
        const rowMcap = row.reduce((s, r) => s + (r.total_market_cap || 1), 0);
        const rowFraction = rowMcap / remainingMcap;

        let rowSize, items;
        if (isHorizontal) {
          rowSize = remainingW * rowFraction;
          items = row.map(r => ({
            ...r,
            w: rowSize - padding,
            h: (remainingH * ((r.total_market_cap || 1) / rowMcap)) - padding,
          }));
        } else {
          rowSize = remainingH * rowFraction;
          items = row.map(r => ({
            ...r,
            w: (remainingW * ((r.total_market_cap || 1) / rowMcap)) - padding,
            h: rowSize - padding,
          }));
        }

        const worstRatio = Math.max(...items.map(it => {
          const r = Math.max(it.w, it.h) / Math.min(it.w, it.h);
          return isNaN(r) ? Infinity : r;
        }));

        if (worstRatio <= bestRatio) {
          bestRatio = worstRatio;
          bestRow = row;
        } else {
          break;
        }
      }

      // Layout the best row
      const rowMcap = bestRow.reduce((s, r) => s + (r.total_market_cap || 1), 0);
      const rowFraction = rowMcap / remainingMcap;
      let cx = x, cy = y;

      if (isHorizontal) {
        const rowW = remainingW * rowFraction;
        bestRow.forEach(sector => {
          const h = remainingH * ((sector.total_market_cap || 1) / rowMcap);
          rects.push({
            x: cx + padding / 2,
            y: cy + padding / 2,
            w: rowW - padding,
            h: h - padding,
            sector,
          });
          cy += h;
        });
        x += rowW;
        remainingW -= rowW;
      } else {
        const rowH = remainingH * rowFraction;
        bestRow.forEach(sector => {
          const w = remainingW * ((sector.total_market_cap || 1) / rowMcap);
          rects.push({
            x: cx + padding / 2,
            y: cy + padding / 2,
            w: w - padding,
            h: rowH - padding,
            sector,
          });
          cx += w;
        });
        y += rowH;
        remainingH -= rowH;
      }

      remaining = remaining.slice(bestRow.length);
    }
    /* eslint-enable no-loop-func */

    // Draw rectangles
    rects.forEach(({ x, y, w, h, sector }) => {
      const change = sector.avg_change_percent || 0;
      ctx.fillStyle = getChangeColor(change, 0.85);
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();

      // Text
      const textColor = getTextColor(change);
      const centerX = x + w / 2;
      const centerY = y + h / 2;

      if (w > 60 && h > 40) {
        ctx.fillStyle = textColor;
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sector.sector, centerX, centerY - 10);

        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
        const sign = change >= 0 ? '+' : '';
        ctx.fillText(`${sign}${change.toFixed(2)}%`, centerX, centerY + 12);
      } else if (w > 40 && h > 25) {
        ctx.fillStyle = textColor;
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sector.sector, centerX, centerY - 6);
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        const sign = change >= 0 ? '+' : '';
        ctx.fillText(`${sign}${change.toFixed(1)}%`, centerX, centerY + 8);
      }
    });
  }, [sectors]);

  useEffect(() => {
    if (viewMode === 'heatmap' && !loading) {
      drawTreemap();
    }
  }, [viewMode, loading, drawTreemap]);

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => {
      if (viewMode === 'heatmap') drawTreemap();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode, drawTreemap]);

  // Stock-level heatmap
  const [indexStocks, setIndexStocks] = useState([]);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [heatmapTab, setHeatmapTab] = useState('sector'); // 'sector' | 'stocks'
  const indexCanvasRef = useRef(null);

  useEffect(() => {
    if (heatmapTab !== 'stocks') return;
    setLoadingIndex(true);
    api.get(`/api/stocks/index-heatmap?market=${market}`)
      .then(res => setIndexStocks(res.data.stocks || []))
      .catch(() => {})
      .finally(() => setLoadingIndex(false));
  }, [heatmapTab, market]);

  // Draw stock-level heatmap
  useEffect(() => {
    if (heatmapTab !== 'stocks' || !indexCanvasRef.current || indexStocks.length === 0) return;
    const canvas = indexCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const container = canvas.parentElement;
    const width = container.clientWidth;
    const height = 500;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Simple grid layout
    const cols = Math.ceil(Math.sqrt(indexStocks.length * 1.5));
    const cellW = width / cols;
    const rows = Math.ceil(indexStocks.length / cols);
    const cellH = height / rows;

    indexStocks.forEach((stock, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW;
      const y = row * cellH;
      const change = stock.change_percent || 0;

      // Color by change
      ctx.fillStyle = getChangeColor(change, 0.85);
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Text
      const sym = stock.symbol.replace('.NS', '').replace('.BO', '');
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.min(11, cellW / 6)}px system-ui`;
      ctx.fillText(sym, x + cellW / 2, y + cellH / 2 - 4);
      ctx.font = `${Math.min(10, cellW / 7)}px system-ui`;
      ctx.fillText(`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, x + cellW / 2, y + cellH / 2 + 10);
    });
  }, [indexStocks, heatmapTab]);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Market Heatmap</h1>
            <p className="text-sm text-gray-500 mt-1">
              {heatmapTab === 'sector' ? 'Sector' : market === 'in' ? 'NIFTY 50' : 'S&P 500'} performance for {market === 'in' ? 'Indian' : 'US'} market
            </p>
          </div>
          {heatmapTab === 'sector' && (
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('heatmap')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'heatmap'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Heatmap
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Table
              </button>
            </div>
          )}
        </div>

        {/* Sector vs Stocks Tab */}
        <div className="flex gap-2">
          <button onClick={() => setHeatmapTab('sector')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none ${
              heatmapTab === 'sector' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            Sectors
          </button>
          <button onClick={() => setHeatmapTab('stocks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none ${
              heatmapTab === 'stocks' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {market === 'in' ? 'NIFTY 50' : 'S&P 500'} Stocks
          </button>
        </div>

        {/* Stock-level Heatmap */}
        {heatmapTab === 'stocks' && (
          <div>
            {loadingIndex ? (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-gray-500 text-sm">Loading stock data...</p>
              </div>
            ) : indexStocks.length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div style={{ width: '100%', height: 500 }}>
                  <canvas ref={indexCanvasRef} style={{ width: '100%', height: '100%' }} />
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">No stock data available.</div>
            )}
          </div>
        )}

        {/* Sector Heatmap Content */}
        {heatmapTab === 'sector' && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {heatmapTab === 'sector' && loading && <SkeletonHeatmap />}

        {/* Heatmap View */}
        {heatmapTab === 'sector' && !loading && !error && viewMode === 'heatmap' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ height: '420px' }}
            />
            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(185, 28, 28, 0.85)' }}></div>
                <span className="text-xs text-gray-500">&lt; -3%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.85)' }}></div>
                <span className="text-xs text-gray-500">-3% to -1.5%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(252, 165, 165, 0.85)' }}></div>
                <span className="text-xs text-gray-500">-1.5% to 0%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(134, 239, 172, 0.85)' }}></div>
                <span className="text-xs text-gray-500">0% to 1.5%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.85)' }}></div>
                <span className="text-xs text-gray-500">1.5% to 3%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(22, 163, 74, 0.85)' }}></div>
                <span className="text-xs text-gray-500">&gt; 3%</span>
              </div>
            </div>
          </div>
        )}

        {/* Table View */}
        {heatmapTab === 'sector' && !loading && !error && viewMode === 'table' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Sector</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Avg Change%</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Top Gainer</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Top Loser</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Market Cap</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Stocks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sectors.map((sector) => (
                    <tr key={sector.sector} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getChangeColor(sector.avg_change_percent) }}
                          ></div>
                          <span className="font-semibold text-gray-900">{sector.sector}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${sector.avg_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {sector.avg_change_percent >= 0 ? '+' : ''}{sector.avg_change_percent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {sector.top_gainer && (
                          <Link
                            to={`/stock/${sector.top_gainer.symbol}`}
                            className="hover:text-blue-600 transition-colors"
                          >
                            <span className="text-gray-900 text-sm">{sector.top_gainer.name}</span>
                            <span className="text-green-600 text-xs ml-1.5 font-medium">
                              +{sector.top_gainer.change_percent?.toFixed(2)}%
                            </span>
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {sector.top_loser && (
                          <Link
                            to={`/stock/${sector.top_loser.symbol}`}
                            className="hover:text-blue-600 transition-colors"
                          >
                            <span className="text-gray-900 text-sm">{sector.top_loser.name}</span>
                            <span className="text-red-600 text-xs ml-1.5 font-medium">
                              {sector.top_loser.change_percent?.toFixed(2)}%
                            </span>
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatMarketCap(sector.total_market_cap)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {sector.stock_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {heatmapTab === 'sector' && !loading && !error && sectors.length === 0 && (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <p className="text-gray-500">No sector data available.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default SectorHeatmapPage;
