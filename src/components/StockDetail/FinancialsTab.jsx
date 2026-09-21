// src/components/StockDetail/FinancialsTab.js
import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import { formatCurrency, formatPercent, formatRatio } from '../../utils/formatters';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const InfoRow = ({ label, value, highlight }) => (
  <div className={cn('flex items-center justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0', highlight && 'rounded-sm bg-primary/5 px-2')}>
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums text-foreground">{value ?? 'N/A'}</span>
  </div>
);

const FinancialsTab = ({ symbol }) => {
  const { data: financials, loading, error } = useStockData(`/api/stocks/${symbol}/financials`);
  const { data: statements, loading: stLoading } = useStockData(`/api/stocks/${symbol}/statements`);
  const { currency } = useMarket();
  const [statementType, setStatementType] = useState('income_statement');

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      {/* Key Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Valuation" contentClassName="py-2">
          <InfoRow label="P/E Ratio (TTM)" value={formatRatio(financials?.pe_ratio)} highlight />
          <InfoRow label="Forward P/E" value={formatRatio(financials?.forward_pe)} />
          <InfoRow label="PEG Ratio" value={formatRatio(financials?.peg_ratio)} />
          <InfoRow label="Price/Book" value={formatRatio(financials?.price_to_book)} />
          <InfoRow label="EPS (TTM)" value={financials?.eps ? `${currency}${financials.eps.toFixed(2)}` : 'N/A'} />
          <InfoRow label="Forward EPS" value={financials?.forward_eps ? `${currency}${financials.forward_eps.toFixed(2)}` : 'N/A'} />
          <InfoRow label="Book Value" value={financials?.book_value ? `${currency}${financials.book_value.toFixed(2)}` : 'N/A'} />
        </SectionCard>

        <SectionCard title="Profitability & Growth" contentClassName="py-2">
          <InfoRow label="Profit Margin" value={formatPercent(financials?.profit_margin)} highlight />
          <InfoRow label="Operating Margin" value={formatPercent(financials?.operating_margin)} />
          <InfoRow label="Gross Margin" value={formatPercent(financials?.gross_margin)} />
          <InfoRow label="ROE" value={formatPercent(financials?.return_on_equity)} />
          <InfoRow label="ROA" value={formatPercent(financials?.return_on_assets)} />
          <InfoRow label="Revenue" value={formatCurrency(financials?.revenue, currency)} />
          <InfoRow label="Revenue Growth" value={formatPercent(financials?.revenue_growth)} />
          <InfoRow label="Debt/Equity" value={formatRatio(financials?.debt_to_equity)} />
        </SectionCard>
      </div>

      {/* Financial Statements */}
      {statements && (
        <div>
          <div className="mb-4 inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {['income_statement', 'balance_sheet', 'cash_flow'].map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={statementType === type}
                onClick={() => setStatementType(type)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  statementType === type
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>

          {stLoading ? (
            <TabSkeleton rows={8} />
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Item</TableHead>
                    {statements[statementType]?.map((col) => (
                      <TableHead key={col.date} className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                        {col.date}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements[statementType]?.[0] &&
                    Object.keys(statements[statementType][0])
                      .filter((key) => key !== 'date')
                      .slice(0, 15)
                      .map((key) => (
                        <TableRow key={key}>
                          <TableCell className="text-foreground/85">{key}</TableCell>
                          {statements[statementType].map((col) => (
                            <TableCell key={col.date} className="text-right tabular-nums">
                              {col[key] != null ? formatCurrency(col[key], currency) : 'N/A'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinancialsTab;
