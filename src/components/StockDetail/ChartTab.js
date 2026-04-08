import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import { getDrawings, addDrawing, clearDrawings } from '../../utils/chartDrawings';
import TabSkeleton from './TabSkeleton';

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

const DRAWING_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 1];

const DrawingToolbar = ({ activeTool, setActiveTool, drawingColor, setDrawingColor, onClearAll, drawingCount }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-xs">
    <span className="text-gray-400 font-medium mr-1">Draw:</span>
    {[
      { tool: null, label: 'Off', icon: '↗' },
      { tool: 'hline', label: 'H-Line', icon: '─' },
      { tool: 'fibonacci', label: 'Fib', icon: '⟋' },
    ].map(({ tool, label, icon }) => (
      <button
        key={label}
        onClick={() => setActiveTool(activeTool === tool ? null : tool)}
        className={`px-2 py-1 rounded transition-colors ${
          activeTool === tool ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
        title={label}
      >
        {icon} {label}
      </button>
    ))}
    <div className="flex gap-1 ml-2">
      {DRAWING_COLORS.map(c => (
        <button
          key={c}
          onClick={() => setDrawingColor(c)}
          className={`w-4 h-4 rounded-full border-2 ${drawingColor === c ? 'border-gray-900' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
    {drawingCount > 0 && (
      <button
        onClick={onClearAll}
        className="ml-auto text-red-500 hover:text-red-700 text-xs font-medium"
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

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
      },
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: false,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderDownColor: '#dc2626',
      borderUpColor: '#16a34a',
      wickDownColor: '#dc2626',
      wickUpColor: '#16a34a',
    });

    const validData = data.filter((d) => d.open != null && d.high != null && d.low != null && d.close != null);

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

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData = validData.map((d) => ({
      time: d.date.split('T')[0],
      value: d.volume || 0,
      color: d.close >= d.open ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)',
    }));

    volumeSeries.setData(volumeData);

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
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
      </div>
      {loading ? (
        <div className="animate-pulse" style={{ height }}><div className="h-full bg-gray-50" /></div>
      ) : historyData.length > 0 ? (
        <div style={{ height }}>
          <StockChart data={historyData} height={height} />
        </div>
      ) : (
        <div className="text-gray-400 text-xs text-center py-8">No data</div>
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
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="hidden md:flex items-center bg-gray-100 rounded-lg overflow-hidden">
          {VIEW_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => setViewMode(m.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === m.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      {viewMode === 'single' && !loading && historyData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Period Return</div>
            <div className={`text-sm font-bold ${overallChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {overallChange >= 0 ? '+' : ''}{overallChangePct.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Period High</div>
            <div className="text-sm font-bold text-gray-900">{formatPrice(highest, currency)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Period Low</div>
            <div className="text-sm font-bold text-gray-900">{formatPrice(lowest, currency)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Avg Volume</div>
            <div className="text-sm font-bold text-gray-900">{formatVolume(avgVolume)}</div>
          </div>
        </div>
      )}

      {/* Single Chart */}
      {viewMode === 'single' && (
        <>
          {loading ? (
            <TabSkeleton rows={10} />
          ) : error ? (
            <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>
          ) : historyData.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <DrawingToolbar
                activeTool={activeTool}
                setActiveTool={(t) => { setActiveTool(t); setFibState(null); }}
                drawingColor={drawingColor}
                setDrawingColor={setDrawingColor}
                onClearAll={handleClearAll}
                drawingCount={drawings.length}
              />
              {fibState && activeTool === 'fibonacci' && (
                <div className="px-3 py-1 bg-purple-50 text-purple-700 text-xs">
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
            <div className="text-gray-500 text-center py-8">No chart data available for this period.</div>
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
