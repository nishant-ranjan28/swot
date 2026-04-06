import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';

const SignalBadge = ({ signal }) => {
  const colors = {
    'Strong Buy': 'bg-green-600 text-white',
    'Buy': 'bg-green-100 text-green-700',
    'Neutral': 'bg-yellow-100 text-yellow-700',
    'Sell': 'bg-red-100 text-red-700',
    'Strong Sell': 'bg-red-600 text-white',
    'Bullish': 'bg-green-100 text-green-700',
    'Bearish': 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[signal] || 'bg-gray-100 text-gray-600'}`}>
      {signal}
    </span>
  );
};

const GaugeChart = ({ percentage, signal }) => {
  const rotation = -90 + (percentage / 100) * 180;
  const colors = {
    'Strong Buy': '#16a34a',
    'Buy': '#22c55e',
    'Neutral': '#eab308',
    'Sell': '#ef4444',
    'Strong Sell': '#dc2626',
  };
  const color = colors[signal] || '#6b7280';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-20 overflow-hidden">
        {/* Background arc */}
        <div className="absolute w-40 h-40 rounded-full border-[12px] border-gray-200"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)' }}
        ></div>
        {/* Colored segments */}
        <div className="absolute w-40 h-40 rounded-full border-[12px] border-transparent"
          style={{
            borderTopColor: '#dc2626', borderRightColor: '#ef4444',
            clipPath: 'polygon(0 0, 30% 0, 50% 50%, 0 50%)',
          }}
        ></div>
        {/* Needle */}
        <div className="absolute bottom-0 left-1/2 w-1 h-16 origin-bottom rounded-full"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            background: color,
          }}
        ></div>
        <div className="absolute bottom-0 left-1/2 w-3 h-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-gray-800"></div>
      </div>
      <div className="text-2xl font-bold mt-2" style={{ color }}>{signal}</div>
      <div className="text-sm text-gray-500">{percentage}% Buy signals</div>
    </div>
  );
};

const TechnicalTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/technical`);
  const { currency } = useMarket();

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No technical data available.</div>;

  return (
    <div className="space-y-6">
      {/* Overall Signal */}
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <GaugeChart percentage={data.buy_percentage} signal={data.overall_signal} />
      </div>

      {/* Trend Analysis */}
      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">Trend Analysis</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Short Term', value: data.trend?.short_term },
            { label: 'Medium Term', value: data.trend?.medium_term },
            { label: 'Long Term', value: data.trend?.long_term },
          ].map((t) => (
            <div key={t.label} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">{t.label}</div>
              <SignalBadge signal={t.value} />
            </div>
          ))}
        </div>
      </div>

      {/* Key Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">RSI (14)</div>
          <div className={`text-lg font-bold ${
            data.oscillators?.rsi < 30 ? 'text-green-600' : data.oscillators?.rsi > 70 ? 'text-red-600' : 'text-gray-900'
          }`}>
            {data.oscillators?.rsi || 'N/A'}
          </div>
          <div className="text-[10px] text-gray-400">
            {data.oscillators?.rsi < 30 ? 'Oversold' : data.oscillators?.rsi > 70 ? 'Overbought' : 'Normal'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">MACD</div>
          <div className={`text-lg font-bold ${
            data.oscillators?.macd?.histogram > 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {data.oscillators?.macd?.line || 'N/A'}
          </div>
          <div className="text-[10px] text-gray-400">
            Signal: {data.oscillators?.macd?.signal || 'N/A'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">Volatility</div>
          <div className="text-lg font-bold text-gray-900">{data.volatility}%</div>
          <div className="text-[10px] text-gray-400">Annualized</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">ATR</div>
          <div className="text-lg font-bold text-gray-900">{data.atr || 'N/A'}</div>
          <div className="text-[10px] text-gray-400">Avg True Range</div>
        </div>
      </div>

      {/* Moving Averages */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-md font-semibold text-gray-800">Moving Averages</h3>
          <SignalBadge signal={data.moving_averages?.summary} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 text-gray-600 font-medium">Indicator</th>
                <th className="text-right p-2 text-gray-600 font-medium">Value</th>
                <th className="text-right p-2 text-gray-600 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.moving_averages?.signals?.map((ma) => (
                <tr key={ma.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-2 text-gray-700">{ma.name}</td>
                  <td className="p-2 text-right font-medium">{currency}{ma.value?.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right"><SignalBadge signal={ma.signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Oscillators */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-md font-semibold text-gray-800">Oscillators</h3>
          <SignalBadge signal={data.oscillators?.summary} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 text-gray-600 font-medium">Indicator</th>
                <th className="text-right p-2 text-gray-600 font-medium">Value</th>
                <th className="text-right p-2 text-gray-600 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.oscillators?.signals?.map((osc) => (
                <tr key={osc.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-2 text-gray-700">{osc.name}</td>
                  <td className="p-2 text-right font-medium">{typeof osc.value === 'number' ? osc.value.toFixed(2) : osc.value}</td>
                  <td className="p-2 text-right"><SignalBadge signal={osc.signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bollinger Bands */}
      {data.oscillators?.bollinger?.upper && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Bollinger Bands</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">Upper Band</div>
              <div className="text-sm font-bold text-red-600">{currency}{data.oscillators.bollinger.upper}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">Middle (SMA 20)</div>
              <div className="text-sm font-bold text-gray-900">{currency}{data.oscillators.bollinger.middle}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">Lower Band</div>
              <div className="text-sm font-bold text-green-600">{currency}{data.oscillators.bollinger.lower}</div>
            </div>
          </div>
        </div>
      )}

      {/* Support & Resistance */}
      {(data.support_levels?.length > 0 || data.resistance_levels?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.support_levels?.length > 0 && (
            <div>
              <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>Support Levels
              </h3>
              <div className="space-y-2">
                {data.support_levels.map((level, idx) => (
                  <div key={idx} className="flex justify-between bg-green-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">S{idx + 1}</span>
                    <span className="text-sm font-bold text-green-700">{currency}{level.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.resistance_levels?.length > 0 && (
            <div>
              <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>Resistance Levels
              </h3>
              <div className="space-y-2">
                {data.resistance_levels.map((level, idx) => (
                  <div key={idx} className="flex justify-between bg-red-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">R{idx + 1}</span>
                    <span className="text-sm font-bold text-red-700">{currency}{level.toLocaleString(currency === '$' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex gap-2">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">Disclaimer:</span> Technical indicators are mathematical calculations based on historical price and volume data. They are not predictions of future performance and should not be used as the sole basis for investment decisions. Always combine with fundamental analysis and consult a qualified financial advisor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TechnicalTab;
