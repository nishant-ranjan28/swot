// src/components/StockDetail/DividendsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const headClass = 'text-xs uppercase tracking-wide text-muted-foreground';

const DividendsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/dividends`);
  const { currency } = useMarket();

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No dividend data available." />;

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
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      {/* Dividend History */}
      {data.history?.length > 0 && (
        <SectionCard title="Dividend History" contentClassName="p-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Date</TableHead>
                <TableHead className={`text-right ${headClass}`}>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.slice(-20).reverse().map((entry) => (
                <TableRow key={entry.date}>
                  <TableCell className="text-foreground/85 tabular-nums">{entry.date}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-gain">{currency}{entry.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {/* Stock Splits */}
      {data.splits?.length > 0 && (
        <SectionCard title="Stock Splits" contentClassName="p-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Date</TableHead>
                <TableHead className={`text-right ${headClass}`}>Ratio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.splits.reverse().map((entry) => (
                <TableRow key={entry.date}>
                  <TableCell className="text-foreground/85 tabular-nums">{entry.date}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{entry.ratio}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}
    </div>
  );
};

export default DividendsTab;
