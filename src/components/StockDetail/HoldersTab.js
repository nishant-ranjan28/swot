import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const OwnershipBar = ({ label, value }) => {
  const isPercent = typeof value === 'number' && value <= 100;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-gray-600 w-48">{label}</span>
      {isPercent ? (
        <>
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full bg-blue-500"
              style={{ width: `${Math.min(value, 100)}%` }}
            ></div>
          </div>
          <span className="text-sm font-semibold text-gray-900 w-16 text-right">{value}%</span>
        </>
      ) : (
        <span className="text-sm font-semibold text-gray-900">{value}</span>
      )}
    </div>
  );
};

const HoldersTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/holders`);
  const [holderType, setHolderType] = useState('institutional');

  if (loading) return <TabSkeleton rows={8} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No holder data available.</div>;

  const holders = holderType === 'institutional' ? data.institutional : data.mutual_fund;
  const hasHolders = holders?.length > 0;
  const hasOwnership = data.ownership?.length > 0;

  return (
    <div className="space-y-6">
      {/* Ownership Breakdown */}
      {hasOwnership && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Ownership Breakdown</h3>
          <div className="space-y-1">
            {data.ownership.map((item, idx) => (
              <OwnershipBar key={idx} label={item.category} value={item.value} />
            ))}
          </div>
        </div>
      )}

      {/* Institutional / Mutual Fund Toggle */}
      <div>
        <div className="flex gap-2 mb-4">
          {['institutional', 'mutual_fund'].map((type) => (
            <button
              key={type}
              onClick={() => setHolderType(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                holderType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type === 'institutional' ? 'Institutional' : 'Mutual Fund'}
            </button>
          ))}
        </div>

        {hasHolders ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Holder</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Shares</th>
                  <th className="text-right p-2 text-gray-600 font-medium">% Held</th>
                  <th className="text-right p-2 text-gray-600 font-medium hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {holders.map((holder, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-gray-700 max-w-xs truncate">{holder.name}</td>
                    <td className="p-2 text-right text-gray-900">{formatNumber(holder.shares)}</td>
                    <td className="p-2 text-right text-gray-900">
                      {holder.percent_held ? `${(holder.percent_held * 100).toFixed(2)}%` : 'N/A'}
                    </td>
                    <td className="p-2 text-right text-gray-500 hidden md:table-cell">{holder.date_reported || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-6 bg-gray-50 rounded-lg">
            Detailed {holderType.replace('_', ' ')} holder data is not available for this stock.
            {hasOwnership && <span className="block text-sm mt-1">See the ownership breakdown above for available data.</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default HoldersTab;
