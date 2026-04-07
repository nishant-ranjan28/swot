import React, { useState, useRef, useEffect } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
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

const StockChart = ({ data }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 400,
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

    // Candlestick series (v5 API)
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

    // Volume histogram series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const volumeData = validData.map((d) => ({
      time: d.date.split('T')[0],
      value: d.volume || 0,
      color: d.close >= d.open ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)',
    }));

    volumeSeries.setData(volumeData);

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div ref={chartContainerRef} style={{ width: '100%', height: 400 }} />
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
          <StockChart data={historyData} />
        </div>
      ) : (
        <div className="text-gray-500 text-center py-8">No chart data available for this period.</div>
      )}
    </div>
  );
};

export default ChartTab;
