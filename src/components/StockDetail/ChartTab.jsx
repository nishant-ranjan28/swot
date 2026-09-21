import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import { getDrawings, addDrawing, clearDrawings } from '../../utils/chartDrawings';
import TabSkeleton from './TabSkeleton';
import { useChartTheme } from '@/hooks/useChartTheme';
import StatCard from '@/components/common/StatCard';
import PriceChange from '@/components/common/PriceChange';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const pillGroup = 'inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1';
const pillClass = (active) => cn(
  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
);

const RANGES = [
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
  { label: 'Max', value: 'max' },
];

const formatPrice = (price, currency = '₹') => `${currency}${price.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatVolume = (vol) => {
  if (vol >= 1e7) return `${(vol / 1e7).toFixed(1)}Cr`;
  if (vol >= 1e5) return `${(vol / 1e5).toFixed(1)}L`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toString();
};

// Theme-dependent chart options, shared by creation and the theme-change effect.
const themeOptions = (ct) => ({
  layout: {
    background: { type: ColorType.Solid, color: ct.background },
    textColor: ct.text,
  },
  grid: {
    vertLines: { color: ct.grid },
    horzLines: { color: ct.grid },
  },
  rightPriceScale: { borderColor: ct.grid },
  timeScale: { borderColor: ct.grid },
});

const candleColors = (ct) => ({
  upColor: ct.gain,
  downColor: ct.loss,
  borderDownColor: ct.loss,
  borderUpColor: ct.gain,
  wickDownColor: ct.loss,
  wickUpColor: ct.gain,
});

const toVolumeData = (validData, ct) => validData.map((d) => ({
  time: d.date.split('T')[0],
  value: d.volume || 0,
  color: d.close >= d.open ? ct.gainArea : ct.lossArea,
}));

const DRAWING_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 1];

const DrawingToolbar = ({ activeTool, setActiveTool, drawingColor, setDrawingColor, onClearAll, drawingCount }) => (
  <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-muted/40 border-b border-border text-xs">
    <span className="text-muted-foreground font-medium mr-1">Draw:</span>
    {[
      { tool: null, label: 'Off', icon: '↗' },
      { tool: 'hline', label: 'H-Line', icon: '─' },
      { tool: 'fibonacci', label: 'Fib', icon: '⟋' },
    ].map(({ tool, label, icon }) => (
      <Button
        key={label}
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setActiveTool(activeTool === tool ? null : tool)}
        className={cn(
          'h-7 px-2 text-xs',
          activeTool === tool
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90'
            : 'text-muted-foreground'
        )}
        title={label}
      >
        {icon} {label}
      </Button>
    ))}
    <div className="flex gap-1 ml-2">
      {DRAWING_COLORS.map(c => (
        <button
          key={c}
          onClick={() => setDrawingColor(c)}
          className={`w-4 h-4 rounded-full border-2 ${drawingColor === c ? 'border-foreground' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
    {drawingCount > 0 && (
      <button
        onClick={onClearAll}
        className="ml-auto text-loss hover:text-loss/80 text-xs font-medium"
      >
        Clear All ({drawingCount})
      </button>
    )}
  </div>
);

const StockChart = ({ data, height = 400, activeTool, drawingColor, drawings, onAddDrawing, fibState, setFibState }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const drawingSeriesRef = useRef([]);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const validDataRef = useRef([]);
  const ct = useChartTheme();
  const ctRef = useRef(ct);

  const renderDrawings = useCallback((chart, validData) => {
    // Remove old drawing series
    drawingSeriesRef.current.forEach(s => {
      try { chart.removeSeries(s); } catch { /* ignore */ }
    });
    drawingSeriesRef.current = [];

    if (!drawings || drawings.length === 0 || validData.length === 0) return;

    const firstTime = validData[0].date.split('T')[0];
    const lastTime = validData[validData.length - 1].date.split('T')[0];

    drawings.forEach(d => {
      if (d.type === 'hline') {
        const series = chart.addSeries(LineSeries, {
          color: d.color || '#ef4444',
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
        });
        series.setData([
          { time: firstTime, value: d.price },
          { time: lastTime, value: d.price },
        ]);
        drawingSeriesRef.current.push(series);
      } else if (d.type === 'fibonacci' && d.high != null && d.low != null) {
        const range = d.high - d.low;
        FIB_LEVELS.forEach(level => {
          const price = d.high - range * level;
          const series = chart.addSeries(LineSeries, {
            color: d.color || '#8b5cf6',
            lineWidth: 1,
            lineStyle: level === 0 || level === 1 ? 0 : 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          series.setData([
            { time: firstTime, value: price },
            { time: lastTime, value: price },
          ]);
          drawingSeriesRef.current.push(series);
        });
      }
    });
  }, [drawings]);

  // Recolor in place on theme change; recreating the chart would lose zoom and drawings.
  // Declared before the creation effect so ctRef is current when a new chart is built.
  useEffect(() => {
    ctRef.current = ct;
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions(themeOptions(ct));
    candleSeriesRef.current?.applyOptions(candleColors(ct));
    volumeSeriesRef.current?.setData(toVolumeData(validDataRef.current, ct));
  }, [ct]);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const container = chartContainerRef.current;

    const theme = themeOptions(ctRef.current);
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: theme.layout,
      grid: theme.grid,
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: theme.rightPriceScale,
      timeScale: {
        ...theme.timeScale,
        timeVisible: false,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, candleColors(ctRef.current));
    candleSeriesRef.current = candlestickSeries;

    const validData = data.filter((d) => d.open != null && d.high != null && d.low != null && d.close != null);
    validDataRef.current = validData;

    const candleData = validData.map((d) => ({
      time: d.date.split('T')[0],
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candlestickSeries.setData(candleData);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    volumeSeries.setData(toVolumeData(validData, ctRef.current));

    // Render saved drawings
    renderDrawings(chart, validData);

    // Click handler for drawing tools
    chart.subscribeClick((param) => {
      if (!activeTool || !param.point) return;
      const price = candlestickSeries.coordinateToPrice(param.point.y);
      if (price == null) return;

      if (activeTool === 'hline') {
        onAddDrawing({ type: 'hline', price: Math.round(price * 100) / 100, color: drawingColor });
      } else if (activeTool === 'fibonacci') {
        if (!fibState) {
          setFibState({ high: price });
        } else {
          const high = Math.max(fibState.high, price);
          const low = Math.min(fibState.high, price);
          onAddDrawing({ type: 'fibonacci', high: Math.round(high * 100) / 100, low: Math.round(low * 100) / 100, color: drawingColor });
          setFibState(null);
        }
      }
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (container) chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      drawingSeriesRef.current = [];
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      validDataRef.current = [];
    };
  }, [data, height, activeTool, drawingColor, renderDrawings, onAddDrawing, fibState, setFibState]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '100%', height, cursor: activeTool ? 'crosshair' : 'default' }}
    />
  );
};

const VIEW_MODES = [
  { value: 'single', label: 'Single' },
  { value: 'dual', label: 'Dual' },
  { value: 'quad', label: 'Quad' },
];

const DUAL_RANGES = [
  { label: '1M', value: '1mo' },
  { label: '1Y', value: '1y' },
];

const QUAD_RANGES = [
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
];

const MiniChart = ({ symbol, range, label, height = 250 }) => {
  const { data, loading } = useStockData(`/api/stocks/${symbol}/history?range=${range}`);
  const historyData = data?.data || [];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/40 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <div className="p-2" style={{ height }}><Skeleton className="h-full w-full" /></div>
      ) : historyData.length > 0 ? (
        <div style={{ height }}>
          <StockChart data={historyData} height={height} />
        </div>
      ) : (
        <div className="text-muted-foreground text-xs text-center py-8">No data</div>
      )}
    </div>
  );
};

const ChartTab = ({ symbol }) => {
  const [range, setRange] = useState('1y');
  const [viewMode, setViewMode] = useState('single');
  const [activeTool, setActiveTool] = useState(null);
  const [drawingColor, setDrawingColor] = useState('#ef4444');
  const [drawings, setDrawings] = useState(() => getDrawings(symbol));
  const [fibState, setFibState] = useState(null);
  const { currency } = useMarket();
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/history?range=${range}`);

  useEffect(() => {
    setDrawings(getDrawings(symbol));
    setFibState(null);
    setActiveTool(null);
  }, [symbol]);

  const handleAddDrawing = useCallback((drawing) => {
    const updated = addDrawing(symbol, drawing);
    setDrawings([...updated]);
  }, [symbol]);

  const handleClearAll = useCallback(() => {
    clearDrawings(symbol);
    setDrawings([]);
    setFibState(null);
  }, [symbol]);

  const historyData = data?.data || [];
  const first = historyData[0];
  const last = historyData[historyData.length - 1];
  const overallChange = first && last ? last.close - first.close : 0;
  const overallChangePct = first ? ((overallChange / first.close) * 100) : 0;
  const highValues = historyData.filter(d => d.high != null).map(d => d.high);
  const lowValues = historyData.filter(d => d.low != null).map(d => d.low);
  const highest = highValues.length > 0 ? Math.max(...highValues) : 0;
  const lowest = lowValues.length > 0 ? Math.min(...lowValues) : 0;
  const avgVolume = historyData.length > 0 ? Math.round(historyData.reduce((sum, d) => sum + (d.volume || 0), 0) / historyData.length) : 0;

  return (
    <div className="space-y-4">
      {/* Range Selector + View Mode */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className={pillGroup} role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={pillClass(range === r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className={cn(pillGroup, 'hidden md:inline-flex')} role="group" aria-label="Chart view">
          {VIEW_MODES.map(m => (
            <button
              key={m.value}
              type="button"
              aria-pressed={viewMode === m.value}
              onClick={() => setViewMode(m.value)}
              className={pillClass(viewMode === m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      {viewMode === 'single' && !loading && historyData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Period Return"
            value={<PriceChange percent={overallChangePct} />}
            className="p-3"
          />
          <StatCard label="Period High" value={formatPrice(highest, currency)} className="p-3" />
          <StatCard label="Period Low" value={formatPrice(lowest, currency)} className="p-3" />
          <StatCard label="Avg Volume" value={formatVolume(avgVolume)} className="p-3" />
        </div>
      )}

      {/* Single Chart */}
      {viewMode === 'single' && (
        <>
          {loading ? (
            <TabSkeleton rows={10} />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : historyData.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <DrawingToolbar
                activeTool={activeTool}
                setActiveTool={(t) => { setActiveTool(t); setFibState(null); }}
                drawingColor={drawingColor}
                setDrawingColor={setDrawingColor}
                onClearAll={handleClearAll}
                drawingCount={drawings.length}
              />
              {fibState && activeTool === 'fibonacci' && (
                <div className="px-3 py-1 bg-primary/10 text-foreground text-xs">
                  Click second point to complete Fibonacci retracement
                </div>
              )}
              <StockChart
                data={historyData}
                activeTool={activeTool}
                drawingColor={drawingColor}
                drawings={drawings}
                onAddDrawing={handleAddDrawing}
                fibState={fibState}
                setFibState={setFibState}
              />
            </div>
          ) : (
            <EmptyState title="No chart data available for this period." />
          )}
        </>
      )}

      {/* Dual Chart */}
      {viewMode === 'dual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DUAL_RANGES.map(r => (
            <MiniChart key={r.value} symbol={symbol} range={r.value} label={r.label} height={300} />
          ))}
        </div>
      )}

      {/* Quad Chart */}
      {viewMode === 'quad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUAD_RANGES.map(r => (
            <MiniChart key={r.value} symbol={symbol} range={r.value} label={r.label} height={250} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ChartTab;
