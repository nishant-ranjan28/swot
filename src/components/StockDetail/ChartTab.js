import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
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

const StockChart = ({ data, range, currency = '₹' }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const PADDING = React.useMemo(() => ({ top: 20, right: 60, bottom: 40, left: 10 }), []);
  const chartHeight = 320;
  const volumeHeight = 60;

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: chartHeight + volumeHeight + PADDING.top + PADDING.bottom,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [PADDING]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0 || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const w = dimensions.width;
    const h = dimensions.height;

    ctx.clearRect(0, 0, w, h);

    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const minPrice = Math.min(...closes) * 0.995;
    const maxPrice = Math.max(...closes) * 1.005;
    const maxVolume = Math.max(...volumes);

    const chartW = w - PADDING.left - PADDING.right;
    const priceH = chartHeight;
    const volTop = PADDING.top + priceH + 10;

    const xScale = (i) => PADDING.left + (i / (data.length - 1)) * chartW;
    const yScale = (price) => PADDING.top + priceH - ((price - minPrice) / (maxPrice - minPrice)) * priceH;

    const isPositive = closes[closes.length - 1] >= closes[0];
    const lineColor = isPositive ? '#16a34a' : '#dc2626';
    const fillColor = isPositive ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)';

    // Grid lines
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    const priceSteps = 5;
    for (let i = 0; i <= priceSteps; i++) {
      const y = PADDING.top + (priceH / priceSteps) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(w - PADDING.right, y);
      ctx.stroke();

      // Price labels
      const price = maxPrice - ((maxPrice - minPrice) / priceSteps) * i;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(price, currency), w - 5, y + 4);
    }

    // Date labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    const dateSteps = Math.min(6, data.length - 1);
    for (let i = 0; i <= dateSteps; i++) {
      const idx = Math.floor((i / dateSteps) * (data.length - 1));
      const x = xScale(idx);
      const date = new Date(data[idx].date);
      const label = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      ctx.fillText(label, x, volTop + volumeHeight + 15);
    }

    // Fill area
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(closes[0]));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(closes[i]));
    }
    ctx.lineTo(xScale(data.length - 1), PADDING.top + priceH);
    ctx.lineTo(xScale(0), PADDING.top + priceH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Price line
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(closes[0]));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(closes[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Volume bars
    const barWidth = Math.max(1, chartW / data.length - 1);
    for (let i = 0; i < data.length; i++) {
      const x = xScale(i) - barWidth / 2;
      const barH = (volumes[i] / maxVolume) * volumeHeight;
      const barColor = closes[i] >= (closes[i - 1] || closes[i]) ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)';
      ctx.fillStyle = barColor;
      ctx.fillRect(x, volTop + volumeHeight - barH, barWidth, barH);
    }
  }, [data, dimensions, PADDING, currency]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  const handleMouseMove = (e) => {
    if (!data || data.length === 0 || dimensions.width === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartW = dimensions.width - PADDING.left - PADDING.right;
    const idx = Math.round(((mouseX - PADDING.left) / chartW) * (data.length - 1));
    if (idx >= 0 && idx < data.length) {
      const point = data[idx];
      const change = point.close - data[0].close;
      const changePct = ((change / data[0].close) * 100);
      setTooltip({
        x: mouseX,
        date: new Date(point.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
        change,
        changePct,
      });
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none z-10"
          style={{
            left: Math.min(tooltip.x + 10, dimensions.width - 200),
            top: 10,
          }}
        >
          <div className="font-semibold mb-1">{tooltip.date}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-gray-400">Open</span><span>{formatPrice(tooltip.open, currency)}</span>
            <span className="text-gray-400">High</span><span>{formatPrice(tooltip.high, currency)}</span>
            <span className="text-gray-400">Low</span><span>{formatPrice(tooltip.low, currency)}</span>
            <span className="text-gray-400">Close</span><span className="font-semibold">{formatPrice(tooltip.close, currency)}</span>
            <span className="text-gray-400">Volume</span><span>{formatVolume(tooltip.volume)}</span>
          </div>
          <div className={`mt-1 pt-1 border-t border-gray-700 font-semibold ${tooltip.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {tooltip.change >= 0 ? '+' : ''}{formatPrice(tooltip.change, currency)} ({tooltip.changePct >= 0 ? '+' : ''}{tooltip.changePct.toFixed(2)}%)
          </div>
        </div>
      )}
    </div>
  );
};

const ChartTab = ({ symbol }) => {
  const [range, setRange] = useState('1y');
  const { currency } = useMarket();
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/history?range=${range}`);

  const historyData = data?.data || [];
  const first = historyData[0];
  const last = historyData[historyData.length - 1];
  const overallChange = first && last ? last.close - first.close : 0;
  const overallChangePct = first ? ((overallChange / first.close) * 100) : 0;
  const highest = historyData.length > 0 ? Math.max(...historyData.map(d => d.high)) : 0;
  const lowest = historyData.length > 0 ? Math.min(...historyData.map(d => d.low)) : 0;
  const avgVolume = historyData.length > 0 ? Math.round(historyData.reduce((sum, d) => sum + d.volume, 0) / historyData.length) : 0;

  return (
    <div className="space-y-4">
      {/* Range Selector */}
      <div className="flex items-center justify-between">
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
      </div>

      {/* Stats Row */}
      {!loading && historyData.length > 0 && (
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

      {/* Chart */}
      {loading ? (
        <TabSkeleton rows={10} />
      ) : error ? (
        <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>
      ) : historyData.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-100">
          <StockChart data={historyData} range={range} currency={currency} />
        </div>
      ) : (
        <div className="text-gray-500 text-center py-8">No chart data available for this period.</div>
      )}
    </div>
  );
};

export default ChartTab;
