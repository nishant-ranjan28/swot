import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';

const DAY_OPTIONS = [7, 14, 30];

const PredictionTab = ({ symbol }) => {
  const [days, setDays] = useState(7);
  const { data, loading, error, refetch } = useStockData(
    `/api/stocks/${symbol}/predict?days=${days}`
  );
  const { currency } = useMarket();
  const canvasRef = useRef(null);

  const locale = currency === '$' ? 'en-US' : 'en-IN';
  const fmtPrice = (val) =>
    val != null
      ? `${currency}${val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '-';

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const predictions = data.predictions || [];
    if (predictions.length === 0) return;

    // Build data points: current price + predictions
    const currentPrice = data.current_price;
    const allPrices = [currentPrice, ...predictions.map((p) => p.predicted_price)];
    const labels = ['Current', ...predictions.map((p) => p.date.slice(5))]; // MM-DD

    const minPrice = Math.min(...allPrices) * 0.995;
    const maxPrice = Math.max(...allPrices) * 1.005;
    const priceRange = maxPrice - minPrice || 1;

    const padL = 60;
    const padR = 20;
    const padT = 20;
    const padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const xStep = chartW / (allPrices.length - 1 || 1);
    const getX = (i) => padL + i * xStep;
    const getY = (price) => padT + chartH - ((price - minPrice) / priceRange) * chartH;

    // Grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();

      // Y-axis labels
      const price = maxPrice - (priceRange / gridLines) * i;
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(2), padL - 6, y + 3);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    const labelStep = Math.max(1, Math.floor(labels.length / 8));
    labels.forEach((label, i) => {
      if (i % labelStep === 0 || i === labels.length - 1) {
        ctx.fillText(label, getX(i), H - padB + 18);
      }
    });

    // Current price point (solid dot)
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(getX(0), getY(currentPrice), 5, 0, Math.PI * 2);
    ctx.fill();

    // Predicted prices (dashed line)
    const predColor = data.direction === 'Bullish' ? '#16a34a' : '#dc2626';
    ctx.strokeStyle = predColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(currentPrice));
    for (let i = 1; i < allPrices.length; i++) {
      ctx.lineTo(getX(i), getY(allPrices[i]));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Predicted price dots
    ctx.fillStyle = predColor;
    for (let i = 1; i < allPrices.length; i++) {
      ctx.beginPath();
      ctx.arc(getX(i), getY(allPrices[i]), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Current price label
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Current: ${currentPrice.toFixed(2)}`, getX(0) + 8, getY(currentPrice) - 8);

    // End price label
    const endPrice = allPrices[allPrices.length - 1];
    ctx.fillStyle = predColor;
    ctx.textAlign = 'right';
    ctx.fillText(endPrice.toFixed(2), getX(allPrices.length - 1) - 8, getY(endPrice) - 8);
  }, [data]);

  useEffect(() => {
    drawChart();
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  if (loading) return <TabSkeleton rows={8} />;
  if (error)
    return (
      <div className="text-red-600 text-center py-8">
        {error}
        <button onClick={refetch} className="text-blue-600 underline ml-2">
          Retry
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="text-gray-500 text-center py-8">
        No prediction data available for this stock.
      </div>
    );

  const dirColor = data.direction === 'Bullish' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300';
  const changeSign = data.predicted_change_pct >= 0 ? '+' : '';

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 flex items-start gap-3">
        <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div>
          <p className="font-bold text-amber-800 text-sm">Disclaimer</p>
          <p className="text-amber-700 text-sm">{data.disclaimer}</p>
        </div>
      </div>

      {/* Day Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 font-medium">Prediction Period:</span>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Direction Badge + Model Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Direction */}
        <div className={`rounded-lg border p-4 text-center ${dirColor}`}>
          <p className="text-xs uppercase tracking-wide font-semibold opacity-70">Direction</p>
          <p className="text-2xl font-bold mt-1">{data.direction}</p>
          <p className="text-sm font-medium mt-1">
            {changeSign}{data.predicted_change_pct}%
          </p>
        </div>

        {/* Model */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Model</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{data.model}</p>
          <p className="text-sm text-gray-500 mt-1">
            R&sup2; Accuracy: <span className="font-semibold text-gray-800">{data.model_accuracy}%</span>
          </p>
        </div>

        {/* MAPE */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">MAPE</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.mape}%</p>
          <p className="text-xs text-gray-400 mt-1">Mean Absolute % Error</p>
        </div>
      </div>

      {/* Prediction Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Price Prediction Chart</h3>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: '300px' }}
        />
        <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Current Price
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-8 border-t-2 border-dashed" style={{ borderColor: data.direction === 'Bullish' ? '#16a34a' : '#dc2626' }} />
            Predicted ({data.direction})
          </span>
        </div>
      </div>

      {/* Prediction Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
          Day-by-Day Predictions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Predicted Price</th>
                <th className="px-4 py-2 text-right">Change from Current</th>
              </tr>
            </thead>
            <tbody>
              {(data.predictions || []).map((p, idx) => {
                const diff = p.predicted_price - data.current_price;
                const diffPct = ((diff / data.current_price) * 100).toFixed(2);
                const isUp = diff >= 0;
                return (
                  <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{p.date}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">
                      {fmtPrice(p.predicted_price)}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                      {isUp ? '+' : ''}{diffPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Current Price Footer */}
      <div className="text-center text-sm text-gray-500">
        Current Price: <span className="font-semibold text-gray-800">{fmtPrice(data.current_price)}</span>
      </div>
    </div>
  );
};

export default PredictionTab;
