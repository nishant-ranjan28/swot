// src/components/StockDetail/OverviewTab.js
import React from 'react';
import { useMarket } from '../../context/MarketContext';
import { formatNumber } from '../../utils/formatters';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';

const InfoRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium tabular-nums text-foreground">{value || 'N/A'}</span>
  </div>
);

const OverviewTab = ({ symbol, overview }) => {
  const { currency } = useMarket();

  if (!overview) return <TabSkeleton rows={8} />;

  return (
    <div className="space-y-6">
      {/* Company Description */}
      {overview.description && (
        <SectionCard title="About">
          <p className="text-sm leading-relaxed text-muted-foreground">{overview.description}</p>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Info */}
        <SectionCard title="Company Info" contentClassName="py-2">
          <InfoRow label="Sector" value={overview.sector} />
          <InfoRow label="Industry" value={overview.industry} />
          <InfoRow label="Employees" value={overview.employees?.toLocaleString('en-IN')} />
          <InfoRow
            label="Website"
            value={
              overview.website ? (
                <a href={overview.website} target="_blank" rel="noopener noreferrer" className="text-foreground dark:text-primary hover:underline">
                  {overview.website.replace(/^https?:\/\//, '')}
                </a>
              ) : null
            }
          />
        </SectionCard>

        {/* Key Stats */}
        <SectionCard title="Key Statistics" contentClassName="py-2">
          <InfoRow label="Market Cap" value={formatNumber(overview.market_cap, currency)} />
          <InfoRow label="Enterprise Value" value={formatNumber(overview.enterprise_value, currency)} />
          <InfoRow label="52-Week High" value={overview.fifty_two_week_high ? `${currency}${overview.fifty_two_week_high.toFixed(2)}` : null} />
          <InfoRow label="52-Week Low" value={overview.fifty_two_week_low ? `${currency}${overview.fifty_two_week_low.toFixed(2)}` : null} />
          <InfoRow label="50-Day Avg" value={overview.fifty_day_average ? `${currency}${overview.fifty_day_average.toFixed(2)}` : null} />
          <InfoRow label="200-Day Avg" value={overview.two_hundred_day_average ? `${currency}${overview.two_hundred_day_average.toFixed(2)}` : null} />
        </SectionCard>
      </div>
    </div>
  );
};

export default OverviewTab;
