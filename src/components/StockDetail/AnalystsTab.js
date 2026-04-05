// src/components/StockDetail/AnalystsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
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
              {item.label === 'Analysts' ? item.value || 'N/A' : item.value ? `₹${item.value.toFixed(2)}` : 'N/A'}
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
            return (
              <div key={rating.period} className="bg-gray-50 rounded-lg p-4 mb-3">
                <div className="text-sm font-medium text-gray-700 mb-3">{rating.period}</div>
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
    </div>
  );
};

export default AnalystsTab;
