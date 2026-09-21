// src/components/StockDetail/DividendsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';

const DividendsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/dividends`);
  const { currency } = useMarket();

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No dividend data available.</div>;

  const formatPercent = (val) => (val != null ? `${val.toFixed(2)}%` : 'N/A');

  return (
    <div className="space-y-6">
      {/* Dividend Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Dividend Yield', value: formatPercent(data.dividend_yield) },
          { label: 'Dividend Rate', value: data.dividend_rate ? `${currency}${data.dividend_rate.toFixed(2)}` : 'N/A' },
          { label: 'Payout Ratio', value: formatPercent(data.payout_ratio) },
          { label: 'Ex-Dividend Date', value: data.ex_dividend_date || 'N/A' },
        ].map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-500 mb-1">{item.label}</div>
            <div className="text-lg font-bold text-gray-900">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Dividend History */}
      {data.history?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Dividend History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Date</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.history.slice(-20).reverse().map((entry) => (
                  <tr key={entry.date} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-gray-700">{entry.date}</td>
                    <td className="p-2 text-right text-green-600 font-medium">{currency}{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Splits */}
      {data.splits?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Stock Splits</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Date</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {data.splits.reverse().map((entry) => (
                  <tr key={entry.date} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-gray-700">{entry.date}</td>
                    <td className="p-2 text-right font-medium">{entry.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DividendsTab;
