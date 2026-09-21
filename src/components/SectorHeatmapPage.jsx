import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import PriceChange from '@/components/common/PriceChange';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';
import { useChartTheme } from '@/hooks/useChartTheme';
import { withAlpha } from '@/lib/color';
import { cn } from '@/lib/utils';
import { segmentClass } from '@/lib/segment';

const formatMarketCap = (value) => {
  if (!value) return 'N/A';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString();
};

// Heat scale: the original thresholds, mapped to a tone (gain/loss/neutral) and an intensity step.
// Comparison order is unchanged, so non-numeric input still falls through to the strongest loss step.
const getHeatLevel = (change) => {
  if (change > 3) return { tone: 'gain', step: 'strong' };
  if (change > 1.5) return { tone: 'gain', step: 'mid' };
  if (change > 0) return { tone: 'gain', step: 'weak' };
  if (change === 0) return { tone: 'neutral', step: null };
  if (change > -1.5) return { tone: 'loss', step: 'weak' };
  if (change > -3) return { tone: 'loss', step: 'mid' };
  return { tone: 'loss', step: 'strong' };
};

const HEAT_ALPHA = { weak: 0.45, mid: 0.7, strong: 0.9 };

// Literal class names so Tailwind picks them up; opacity matches HEAT_ALPHA.
const HEAT_CLASS = {
  gain: { weak: 'bg-gain/45', mid: 'bg-gain/70', strong: 'bg-gain/90' },
  loss: { weak: 'bg-loss/45', mid: 'bg-loss/70', strong: 'bg-loss/90' },
};

// Canvas fill for a change value.
const getHeatFill = (change, ct) => {
  const { tone, step } = getHeatLevel(change);
  return tone === 'neutral' ? ct.grid : withAlpha(ct[tone], HEAT_ALPHA[step]);
};

// DOM class for a change value.
const getHeatClass = (change) => {
  const { tone, step } = getHeatLevel(change);
  return tone === 'neutral' ? 'bg-muted' : HEAT_CLASS[tone][step];
};

// White on the mid/strong steps, theme foreground on weak/neutral tiles.
const getHeatTextColor = (change, ct) => {
  const { step } = getHeatLevel(change);
  return step === 'mid' || step === 'strong' ? 'white' : ct.foreground;
};

const LEGEND = [
  { cls: HEAT_CLASS.loss.strong, label: '< -3%' },
  { cls: HEAT_CLASS.loss.mid, label: '-3% to -1.5%' },
  { cls: HEAT_CLASS.loss.weak, label: '-1.5% to 0%' },
  { cls: HEAT_CLASS.gain.weak, label: '0% to 1.5%' },
  { cls: HEAT_CLASS.gain.mid, label: '1.5% to 3%' },
  { cls: HEAT_CLASS.gain.strong, label: '> 3%' },
];

const headClass = 'px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const SkeletonHeatmap = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    {[...Array(10)].map((_, i) => (
      <Skeleton key={i} className="h-28 rounded-xl" />
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
  const ct = useChartTheme();

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
      ctx.fillStyle = getHeatFill(change, ct);
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
      const textColor = getHeatTextColor(change, ct);
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
  }, [sectors, ct]);

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
      ctx.fillStyle = getHeatFill(change, ct);
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Border
      ctx.strokeStyle = ct.background;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Text
      const sym = stock.symbol.replace('.NS', '').replace('.BO', '');
      ctx.fillStyle = getHeatTextColor(change, ct);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.min(11, cellW / 6)}px system-ui`;
      ctx.fillText(sym, x + cellW / 2, y + cellH / 2 - 4);
      ctx.font = `${Math.min(10, cellW / 7)}px system-ui`;
      ctx.fillText(`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, x + cellW / 2, y + cellH / 2 + 10);
    });
  }, [indexStocks, heatmapTab, ct]);

  return (
    <PageContainer>
      <PageHeader
        title="Market Heatmap"
        description={`${heatmapTab === 'sector' ? 'Sector' : market === 'in' ? 'NIFTY 50' : 'S&P 500'} performance for ${market === 'in' ? 'Indian' : 'US'} market`}
        actions={heatmapTab === 'sector' && (
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="View mode">
            <button type="button" aria-pressed={viewMode === 'heatmap'} onClick={() => setViewMode('heatmap')}
              className={segmentClass(viewMode === 'heatmap')}>
              Heatmap
            </button>
            <button type="button" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}
              className={segmentClass(viewMode === 'table')}>
              Table
            </button>
          </div>
        )}
      />

      {/* Sector vs Stocks Tab */}
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Heatmap type">
        <button type="button" aria-pressed={heatmapTab === 'sector'} onClick={() => setHeatmapTab('sector')}
          className={segmentClass(heatmapTab === 'sector')}>
          Sectors
        </button>
        <button type="button" aria-pressed={heatmapTab === 'stocks'} onClick={() => setHeatmapTab('stocks')}
          className={segmentClass(heatmapTab === 'stocks')}>
          {market === 'in' ? 'NIFTY 50' : 'S&P 500'} Stocks
        </button>
      </div>

      {/* Stock-level Heatmap */}
      {heatmapTab === 'stocks' && (
        <div>
          {loadingIndex ? (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-[420px] w-full" />
              <p className="text-center text-sm text-muted-foreground">Loading stock data...</p>
            </div>
          ) : indexStocks.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div style={{ width: '100%', height: 500 }}>
                <canvas ref={indexCanvasRef} style={{ width: '100%', height: '100%' }} />
              </div>
            </div>
          ) : (
            <EmptyState title="No stock data available." />
          )}
        </div>
      )}

      {/* Sector Heatmap Content */}
      {heatmapTab === 'sector' && error && <ErrorState title={error} />}

      {/* Loading */}
      {heatmapTab === 'sector' && loading && <SkeletonHeatmap />}

      {/* Heatmap View */}
      {heatmapTab === 'sector' && !loading && !error && viewMode === 'heatmap' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ height: '420px' }}
          />
          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t border-border pt-3">
            {LEGEND.map(({ cls, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={cn('h-3 w-4 rounded-sm', cls)}></div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table View */}
      {heatmapTab === 'sector' && !loading && !error && viewMode === 'table' && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className={headClass}>Sector</TableHead>
                <TableHead className={cn(headClass, 'text-right')}>Avg Change%</TableHead>
                <TableHead className={headClass}>Top Gainer</TableHead>
                <TableHead className={headClass}>Top Loser</TableHead>
                <TableHead className={cn(headClass, 'text-right')}>Market Cap</TableHead>
                <TableHead className={cn(headClass, 'text-right')}>Stocks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors.map((sector) => (
                <TableRow key={sector.sector}>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={cn('size-3 shrink-0 rounded-full', getHeatClass(sector.avg_change_percent))}></div>
                      <span className="font-semibold">{sector.sector}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <PriceChange percent={sector.avg_change_percent} className="font-bold" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {sector.top_gainer && (
                      <Link
                        to={`/stock/${sector.top_gainer.symbol}`}
                        className="underline-offset-4 hover:underline"
                      >
                        <span className="text-sm">{sector.top_gainer.name}</span>
                        <PriceChange percent={sector.top_gainer.change_percent} className="ml-1.5 text-xs font-medium" />
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {sector.top_loser && (
                      <Link
                        to={`/stock/${sector.top_loser.symbol}`}
                        className="underline-offset-4 hover:underline"
                      >
                        <span className="text-sm">{sector.top_loser.name}</span>
                        <PriceChange percent={sector.top_loser.change_percent} className="ml-1.5 text-xs font-medium" />
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-foreground/85 tabular-nums">
                    {formatMarketCap(sector.total_market_cap)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                    {sector.stock_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty state */}
      {heatmapTab === 'sector' && !loading && !error && sectors.length === 0 && (
        <EmptyState title="No sector data available." />
      )}
    </PageContainer>
  );
};

export default SectorHeatmapPage;
