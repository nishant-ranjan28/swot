// src/components/StockDetail/AnalystsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';

const RatingBar = ({ label, value, total, color }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-4">
        <div className={`h-4 rounded-full ${color}`} style={{ width: `${pct}%` }}></div>
      </div>
      <span className="text-sm font-medium text-gray-900 w-8 text-right">{value}</span>
    </div>
  );
};

const AnalystsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/analysts`);
  const { currency } = useMarket();

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No analyst data available.</div>;

  return (
    <div className="space-y-6">
      {/* Target Prices */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Target Mean', value: data.target_mean_price },
          { label: 'Target High', value: data.target_high_price },
          { label: 'Target Low', value: data.target_low_price },
          { label: 'Analysts', value: data.number_of_analysts },
        ].map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-500 mb-1">{item.label}</div>
            <div className="text-lg font-bold text-gray-900">
              {item.label === 'Analysts' ? item.value || 'N/A' : item.value ? `${currency}${item.value.toFixed(2)}` : 'N/A'}
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      {data.recommendation && (
        <div className="text-center">
          <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold uppercase ${
            data.recommendation === 'buy' || data.recommendation === 'strong_buy'
              ? 'bg-green-100 text-green-700'
              : data.recommendation === 'hold'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {data.recommendation.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Ratings Breakdown */}
      {data.ratings?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Ratings Breakdown</h3>
          {data.ratings.map((rating) => {
            const total = rating.strong_buy + rating.buy + rating.hold + rating.sell + rating.strong_sell;
            const periodLabels = { '0m': 'Current Month', '-1m': '1 Month Ago', '-2m': '2 Months Ago', '-3m': '3 Months Ago' };
            const periodLabel = periodLabels[rating.period] || rating.period;
            return (
              <div key={rating.period} className="bg-gray-50 rounded-lg p-4 mb-3">
                <div className="text-sm font-medium text-gray-700 mb-3">{periodLabel}</div>
                <div className="space-y-2">
                  <RatingBar label="Strong Buy" value={rating.strong_buy} total={total} color="bg-green-600" />
                  <RatingBar label="Buy" value={rating.buy} total={total} color="bg-green-400" />
                  <RatingBar label="Hold" value={rating.hold} total={total} color="bg-yellow-400" />
                  <RatingBar label="Sell" value={rating.sell} total={total} color="bg-red-400" />
                  <RatingBar label="Strong Sell" value={rating.strong_sell} total={total} color="bg-red-600" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-2">
        <div className="flex gap-2">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-800 mb-1">Disclaimer</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Analyst ratings and target prices are sourced from third-party data providers and are for informational purposes only. They do not constitute financial advice or a recommendation to buy, sell, or hold any security. Always do your own research and consult a qualified financial advisor before making investment decisions. Past performance is not indicative of future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalystsTab;
