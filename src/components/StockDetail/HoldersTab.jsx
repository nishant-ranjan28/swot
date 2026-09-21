import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const headClass = 'text-xs uppercase tracking-wide text-muted-foreground';

const OwnershipBar = ({ label, value }) => {
  const isPercent = typeof value === 'number' && value <= 100;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-muted-foreground w-48">{label}</span>
      {isPercent ? (
        <>
          <div className="flex-1 bg-muted rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-primary"
              style={{ width: `${Math.min(value, 100)}%` }}
            ></div>
          </div>
          <span className="text-sm font-semibold tabular-nums text-foreground w-16 text-right">{value}%</span>
        </>
      ) : (
        <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      )}
    </div>
  );
};

const HoldersTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/holders`);
  const [holderType, setHolderType] = useState('institutional');

  if (loading) return <TabSkeleton rows={8} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No holder data available." />;

  const holders = holderType === 'institutional' ? data.institutional : data.mutual_fund;
  const hasHolders = holders?.length > 0;
  const hasOwnership = data.ownership?.length > 0;

  return (
    <div className="space-y-6">
      {/* Ownership Breakdown */}
      {hasOwnership && (
        <SectionCard title="Ownership Breakdown" contentClassName="space-y-1 py-2">
          {data.ownership.map((item, idx) => (
            <OwnershipBar key={idx} label={item.category} value={item.value} />
          ))}
        </SectionCard>
      )}

      {/* Institutional / Mutual Fund Toggle */}
      <div>
        <div className="mb-4 inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {['institutional', 'mutual_fund'].map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={holderType === type}
              onClick={() => setHolderType(type)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                holderType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {type === 'institutional' ? 'Institutional' : 'Mutual Fund'}
            </button>
          ))}
        </div>

        {hasHolders ? (
          <div className="rounded-xl border border-border bg-card p-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={headClass}>Holder</TableHead>
                  <TableHead className={`text-right ${headClass}`}>Shares</TableHead>
                  <TableHead className={`text-right ${headClass}`}>% Held</TableHead>
                  <TableHead className={`text-right hidden md:table-cell ${headClass}`}>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holders.map((holder, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-foreground/85 max-w-xs truncate">{holder.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(holder.shares)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {holder.percent_held ? `${(holder.percent_held * 100).toFixed(2)}%` : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">{holder.date_reported || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            className="py-8"
            title={`Detailed ${holderType.replace('_', ' ')} holder data is not available for this stock.`}
            description={hasOwnership ? 'See the ownership breakdown above for available data.' : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default HoldersTab;
