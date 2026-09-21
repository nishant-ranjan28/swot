// src/components/StockDetail/AnalystsTab.js
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';

const RatingBar = ({ label, value, total, color }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-24">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }}></div>
      </div>
      <span className="text-sm font-medium tabular-nums text-foreground w-8 text-right">{value}</span>
    </div>
  );
};

const AnalystsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/analysts`);
  const { currency } = useMarket();

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No analyst data available." />;

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
          <StatCard
            key={item.label}
            label={item.label}
            value={item.label === 'Analysts' ? item.value || 'N/A' : item.value ? `${currency}${item.value.toFixed(2)}` : 'N/A'}
          />
        ))}
      </div>

      {/* Recommendation */}
      {data.recommendation && (
        <div className="text-center">
          <Badge
            variant={
              data.recommendation === 'buy' || data.recommendation === 'strong_buy'
                ? 'gain'
                : data.recommendation === 'hold'
                ? 'warning'
                : 'loss'
            }
            className="px-4 py-1.5 text-sm font-bold uppercase"
          >
            {data.recommendation.replace('_', ' ')}
          </Badge>
        </div>
      )}

      {/* Ratings Breakdown */}
      {data.ratings?.length > 0 && (
        <SectionCard title="Ratings Breakdown" contentClassName="space-y-3">
          {data.ratings.map((rating) => {
            const total = rating.strong_buy + rating.buy + rating.hold + rating.sell + rating.strong_sell;
            const periodLabels = { '0m': 'Current Month', '-1m': '1 Month Ago', '-2m': '2 Months Ago', '-3m': '3 Months Ago' };
            const periodLabel = periodLabels[rating.period] || rating.period;
            return (
              <div key={rating.period} className="rounded-lg bg-muted/40 p-4">
                <div className="text-sm font-medium text-foreground/85 mb-3">{periodLabel}</div>
                <div className="space-y-2">
                  <RatingBar label="Strong Buy" value={rating.strong_buy} total={total} color="bg-gain" />
                  <RatingBar label="Buy" value={rating.buy} total={total} color="bg-gain/60" />
                  <RatingBar label="Hold" value={rating.hold} total={total} color="bg-warning" />
                  <RatingBar label="Sell" value={rating.sell} total={total} color="bg-loss/60" />
                  <RatingBar label="Strong Sell" value={rating.strong_sell} total={total} color="bg-loss" />
                </div>
              </div>
            );
          })}
        </SectionCard>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 mt-2">
        <div className="flex gap-2">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">Disclaimer</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Analyst ratings and target prices are sourced from third-party data providers and are for informational purposes only. They do not constitute financial advice or a recommendation to buy, sell, or hold any security. Always do your own research and consult a qualified financial advisor before making investment decisions. Past performance is not indicative of future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalystsTab;
