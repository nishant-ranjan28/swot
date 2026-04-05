// src/components/StockDetail/EarningsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const EarningsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/earnings`);

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No earnings data available.</div>;

  return (
    <div className="space-y-6">
      {/* Next Earnings */}
      {data.earnings_date && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="text-sm text-blue-600 mb-1">Next Earnings Date</div>
          <div className="text-xl font-bold text-blue-900">{data.earnings_date}</div>
        </div>
      )}

      {/* Earnings History */}
      {data.history?.length > 0 ? (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-2">Earnings Per Share (EPS) History</h3>
          <p className="text-xs text-gray-500 mb-3">EPS values represent earnings per share, not stock price</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Quarter</th>
                  <th className="text-right p-2 text-gray-600 font-medium">EPS Estimate</th>
                  <th className="text-right p-2 text-gray-600 font-medium">EPS Actual</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Surprise</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((entry, idx) => {
                  const beat = entry.actual != null && entry.estimate != null && entry.actual > entry.estimate;
                  const miss = entry.actual != null && entry.estimate != null && entry.actual < entry.estimate;
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 text-gray-700">{entry.date}</td>
                      <td className="p-2 text-right text-gray-600">
                        {entry.estimate != null ? entry.estimate.toFixed(2) : 'N/A'}
                      </td>
                      <td className={`p-2 text-right font-medium ${beat ? 'text-green-600' : miss ? 'text-red-600' : 'text-gray-900'}`}>
                        {entry.actual != null ? entry.actual.toFixed(2) : 'N/A'}
                      </td>
                      <td className={`p-2 text-right ${entry.surprise_percent > 0 ? 'text-green-600' : entry.surprise_percent < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {entry.surprise_percent != null ? `${entry.surprise_percent > 0 ? '+' : ''}${entry.surprise_percent.toFixed(2)}%` : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-gray-500 text-center py-8">No earnings history available.</div>
      )}
    </div>
  );
};

export default EarningsTab;
