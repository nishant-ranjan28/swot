import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import { formatNumber } from '../../utils/formatters';
import TabSkeleton from './TabSkeleton';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const headClass = 'text-xs uppercase tracking-wide text-muted-foreground';
const pillClass = (active) => cn(
  'rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
);

const EarningsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/earnings`);
  const { currency } = useMarket();
  const [showAnnual, setShowAnnual] = useState(false);

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No earnings data available." />;

  const m = data.metrics || {};

  const fmtPct = (val) => {
    if (val == null) return '-';
    const pct = val < 1 && val > -1 ? val * 100 : val;
    return <span className={cn('tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>;
  };

  return (
    <div className="space-y-6">
      {/* Next Earnings + Upcoming */}
      {(data.earnings_date || data.upcoming?.length > 0) && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next Earnings Date</div>
              <div className="text-xl font-semibold tabular-nums text-foreground">{data.earnings_date || 'TBD'}</div>
            </div>
            {data.upcoming?.[0]?.estimate && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">EPS Estimate</div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{data.upcoming[0].estimate.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key EPS Metrics */}
      <SectionCard title="Earnings Metrics">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Trailing EPS', value: m.trailing_eps?.toFixed(2) },
            { label: 'Forward EPS', value: m.forward_eps?.toFixed(2) },
            { label: 'P/E Ratio', value: m.pe_ratio?.toFixed(2) },
            { label: 'Forward P/E', value: m.forward_pe?.toFixed(2) },
            { label: 'PEG Ratio', value: m.peg_ratio?.toFixed(2) },
            { label: 'Revenue/Share', value: m.revenue_per_share ? `${currency}${m.revenue_per_share.toFixed(2)}` : null },
            { label: 'Earnings Growth', value: m.earnings_growth != null ? fmtPct(m.earnings_growth) : null, raw: true },
            { label: 'Revenue Growth', value: m.revenue_growth != null ? fmtPct(m.revenue_growth) : null, raw: true },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">{item.raw ? item.value : (item.value || '-')}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Revenue & Profitability Summary */}
      {(m.total_revenue || m.net_income || m.ebitda) && (
        <SectionCard title="Revenue & Profitability (TTM)">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Revenue', value: m.total_revenue },
              { label: 'Net Income', value: m.net_income },
              { label: 'EBITDA', value: m.ebitda },
              { label: 'Gross Profit', value: m.gross_profits },
            ].filter(i => i.value).map((item) => (
              <div key={item.label} className="rounded-lg bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                <div className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(item.value, currency)}</div>
              </div>
            ))}
          </div>
          {(m.profit_margins || m.ebitda_margins) && (
            <div className="flex gap-4 mt-3">
              {m.profit_margins != null && (
                <span className="text-xs text-muted-foreground">Profit Margin: <strong className="tabular-nums text-foreground">{(m.profit_margins * 100).toFixed(1)}%</strong></span>
              )}
              {m.ebitda_margins != null && (
                <span className="text-xs text-muted-foreground">EBITDA Margin: <strong className="tabular-nums text-foreground">{(m.ebitda_margins * 100).toFixed(1)}%</strong></span>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* EPS History */}
      {data.history?.length > 0 && (
        <SectionCard title="EPS History" description="Earnings per share — estimate vs actual with surprise %">
          {/* EPS Beat/Miss visual */}
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {data.history.slice(0, 8).reverse().map((entry, idx) => {
              const beat = entry.actual != null && entry.estimate != null && entry.actual > entry.estimate;
              const miss = entry.actual != null && entry.estimate != null && entry.actual < entry.estimate;
              return (
                <div key={idx} className="flex flex-col items-center min-w-[60px]">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                    beat ? 'bg-gain/12 text-gain' : miss ? 'bg-loss/12 text-loss' : 'bg-muted text-muted-foreground'
                  )}>
                    {beat ? '✓' : miss ? '✗' : '-'}
                  </div>
                  <div className="text-[10px] tabular-nums text-muted-foreground/70 mt-1">{entry.date?.substring(0, 7)}</div>
                  {entry.surprise_percent != null && (
                    <div className={cn('text-[10px] font-semibold tabular-nums', entry.surprise_percent >= 0 ? 'text-gain' : 'text-loss')}>
                      {entry.surprise_percent >= 0 ? '+' : ''}{entry.surprise_percent.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* EPS Table */}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Quarter</TableHead>
                <TableHead className={`text-right ${headClass}`}>EPS Estimate</TableHead>
                <TableHead className={`text-right ${headClass}`}>EPS Actual</TableHead>
                <TableHead className={`text-right ${headClass}`}>Surprise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.map((entry, idx) => {
                const beat = entry.actual != null && entry.estimate != null && entry.actual > entry.estimate;
                const miss = entry.actual != null && entry.estimate != null && entry.actual < entry.estimate;
                return (
                  <TableRow key={idx}>
                    <TableCell className="text-foreground/85 tabular-nums">{entry.date}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{entry.estimate?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', beat ? 'text-gain' : miss ? 'text-loss' : 'text-foreground')}>
                      {entry.actual?.toFixed(2) ?? '-'}
                    </TableCell>
                    <TableCell className={cn('text-right tabular-nums', (entry.surprise_percent || 0) >= 0 ? 'text-gain' : 'text-loss')}>
                      {entry.surprise_percent != null ? `${entry.surprise_percent >= 0 ? '+' : ''}${entry.surprise_percent.toFixed(2)}%` : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {/* Quarterly Financial Results */}
      {data.quarterly?.length > 0 && (
        <SectionCard
          title={`${showAnnual ? 'Annual' : 'Quarterly'} Results`}
          action={
            <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <button type="button" aria-pressed={!showAnnual} onClick={() => setShowAnnual(false)} className={pillClass(!showAnnual)}>
                Quarterly
              </button>
              {data.annual?.length > 0 && (
                <button type="button" aria-pressed={showAnnual} onClick={() => setShowAnnual(true)} className={pillClass(showAnnual)}>
                  Annual
                </button>
              )}
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Period</TableHead>
                <TableHead className={`text-right ${headClass}`}>Revenue</TableHead>
                <TableHead className={`text-right ${headClass}`}>Net Income</TableHead>
                <TableHead className={`text-right ${headClass}`}>Op. Income</TableHead>
                <TableHead className={`text-right ${headClass}`}>EBITDA</TableHead>
                <TableHead className={`text-right ${headClass}`}>Gross Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(showAnnual ? data.annual : data.quarterly)?.map((q, idx) => {
                // Calculate QoQ/YoY growth for revenue
                const prev = (showAnnual ? data.annual : data.quarterly)?.[idx + 1];
                const revGrowth = prev?.revenue && q.revenue ? ((q.revenue - prev.revenue) / prev.revenue * 100) : null;
                return (
                  <TableRow key={idx}>
                    <TableCell className="text-foreground/85 tabular-nums">
                      {q.date}
                      {revGrowth != null && (
                        <div className={cn('text-[10px] tabular-nums', revGrowth >= 0 ? 'text-gain' : 'text-loss')}>
                          Rev {revGrowth >= 0 ? '+' : ''}{revGrowth.toFixed(1)}%
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{q.revenue ? formatNumber(q.revenue, currency) : '-'}</TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', (q.net_income || 0) >= 0 ? 'text-foreground' : 'text-loss')}>
                      {q.net_income ? formatNumber(q.net_income, currency) : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{q.operating_income ? formatNumber(q.operating_income, currency) : '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{q.ebitda ? formatNumber(q.ebitda, currency) : '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{q.gross_profit ? formatNumber(q.gross_profit, currency) : '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Note:</span> Earnings data is sourced from Yahoo Finance and may have slight delays. Quarterly results are based on reported financial statements.
        </p>
      </div>
    </div>
  );
};

export default EarningsTab;
