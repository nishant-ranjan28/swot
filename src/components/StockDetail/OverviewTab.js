// src/components/StockDetail/OverviewTab.js
import React from 'react';
import TabSkeleton from './TabSkeleton';

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
    <span className="text-gray-600 text-sm">{label}</span>
    <span className="font-medium text-gray-900 text-sm text-right">{value || 'N/A'}</span>
  </div>
);

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e12) return `₹${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `₹${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const OverviewTab = ({ symbol, overview }) => {
  if (!overview) return <TabSkeleton rows={8} />;

  return (
    <div className="space-y-6">
      {/* Company Description */}
      {overview.description && (
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">About</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{overview.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Company Info</h3>
          <InfoRow label="Sector" value={overview.sector} />
          <InfoRow label="Industry" value={overview.industry} />
          <InfoRow label="Employees" value={overview.employees?.toLocaleString('en-IN')} />
          <InfoRow
            label="Website"
            value={
              overview.website ? (
                <a href={overview.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {overview.website.replace(/^https?:\/\//, '')}
                </a>
              ) : null
            }
          />
        </div>

        {/* Key Stats */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Key Statistics</h3>
          <InfoRow label="Market Cap" value={formatNumber(overview.market_cap)} />
          <InfoRow label="Enterprise Value" value={formatNumber(overview.enterprise_value)} />
          <InfoRow label="52-Week High" value={overview.fifty_two_week_high ? `₹${overview.fifty_two_week_high.toFixed(2)}` : null} />
          <InfoRow label="52-Week Low" value={overview.fifty_two_week_low ? `₹${overview.fifty_two_week_low.toFixed(2)}` : null} />
          <InfoRow label="50-Day Avg" value={overview.fifty_day_average ? `₹${overview.fifty_day_average.toFixed(2)}` : null} />
          <InfoRow label="200-Day Avg" value={overview.two_hundred_day_average ? `₹${overview.two_hundred_day_average.toFixed(2)}` : null} />
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
