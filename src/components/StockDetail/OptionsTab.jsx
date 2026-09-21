import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import { useMarket } from '../../context/MarketContext';
import TabSkeleton from './TabSkeleton';
import { FileBarChart } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const headClass = 'text-xs uppercase tracking-wide text-muted-foreground';

const OptionsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/options`);
  const { currency } = useMarket();
  const [view, setView] = useState('calls'); // 'calls' | 'puts' | 'both'

  const isIndian = symbol?.endsWith('.NS') || symbol?.endsWith('.BO');

  if (loading) return <TabSkeleton rows={8} />;
  if (error || !data || (!data.calls?.length && !data.puts?.length)) {
    return isIndian ? (
      <EmptyState
        icon={FileBarChart}
        title="Options data not available for Indian stocks"
        description={
          <>
            Yahoo Finance does not provide options chain data for NSE/BSE listed stocks.
            Options data is available for US-listed stocks (e.g., AAPL, MSFT, TSLA).
            <span className="mt-3 block text-xs text-muted-foreground">
              Try switching to the US market and searching for a US stock to view options.
            </span>
          </>
        }
      />
    ) : (
      <EmptyState
        icon={FileBarChart}
        title="No options data available"
        description="This stock may not have listed options, or data is temporarily unavailable."
        action={error && <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>}
      />
    );
  }

  const locale = currency === '$' ? 'en-US' : 'en-IN';
  const fmtPrice = (val) => val != null ? `${currency}${val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
  const fmtNum = (val) => val != null ? val.toLocaleString(locale) : '-';

  const pcr = data.pcr ?? 0;
  const pcrLabel = pcr > 1 ? 'Bearish' : pcr < 0.7 ? 'Bullish' : 'Neutral';
  const pcrColor = pcr > 1 ? 'text-loss' : pcr < 0.7 ? 'text-gain' : 'text-warning';
  const pcrBg = pcr > 1 ? 'bg-loss/5 border-loss/30' : pcr < 0.7 ? 'bg-gain/5 border-gain/30' : 'bg-warning/5 border-warning/30';

  const totalOI = (data.total_call_oi || 0) + (data.total_put_oi || 0);
  const callPct = totalOI > 0 ? Math.round((data.total_call_oi / totalOI) * 100) : 50;
  const putPct = 100 - callPct;

  const currentPrice = data.current_price || 0;

  const renderTable = (options, type) => {
    if (!options || options.length === 0) {
      return <div className="text-muted-foreground text-center py-4">No {type} data.</div>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={headClass}>Strike</TableHead>
            <TableHead className={`text-right ${headClass}`}>Last</TableHead>
            <TableHead className={`text-right ${headClass}`}>Bid</TableHead>
            <TableHead className={`text-right ${headClass}`}>Ask</TableHead>
            <TableHead className={`text-right ${headClass}`}>Volume</TableHead>
            <TableHead className={`text-right ${headClass}`}>OI</TableHead>
            <TableHead className={`text-right ${headClass}`}>IV%</TableHead>
            <TableHead className={`text-center ${headClass}`}>ITM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
            {options.map((opt, idx) => {
              const isNearPrice = currentPrice > 0 &&
                Math.abs(opt.strike - currentPrice) / currentPrice < 0.005;
              const itmBg = opt.in_the_money ? 'bg-primary/5' : '';
              const priceLine = isNearPrice ? 'border-t-2 border-t-primary' : '';

              return (
                <TableRow
                  key={`${type}-${idx}`}
                  className={cn(itmBg, priceLine)}
                >
                  <TableCell className="font-medium tabular-nums text-foreground">{fmtPrice(opt.strike)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPrice(opt.last_price)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtPrice(opt.bid)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtPrice(opt.ask)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(opt.volume)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(opt.open_interest)}</TableCell>
                  <TableCell className="text-right tabular-nums">{opt.implied_vol != null ? `${opt.implied_vol}%` : '-'}</TableCell>
                  <TableCell className="text-center">
                    {opt.in_the_money ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-gain" title="In the Money" />
                    ) : (
                      <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" title="Out of the Money" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header: Expiration + PCR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Expiration Date</div>
          {/* TODO: Backend needs expiry query param support before pills can switch expiration */}
          <div className="flex flex-wrap gap-2">
            {data.expirations?.map((exp) => (
              <span
                key={exp}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium tabular-nums cursor-default',
                  exp === data.selected_expiration
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {exp}
              </span>
            ))}
          </div>
        </div>
        <div className={cn('border rounded-lg px-4 py-2 text-center', pcrBg)}>
          <div className="text-xs text-muted-foreground">Put-Call Ratio</div>
          <div className={cn('text-2xl font-semibold tabular-nums', pcrColor)}>{pcr.toFixed(2)}</div>
          <div className={`text-xs font-semibold ${pcrColor}`}>{pcrLabel}</div>
        </div>
      </div>

      {/* OI Comparison Bar */}
      <div>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground mb-1">
          <span>Call OI: {fmtNum(data.total_call_oi)}</span>
          <span>Put OI: {fmtNum(data.total_put_oi)}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-muted">
          <div
            className="bg-gain transition-all"
            style={{ width: `${callPct}%` }}
            title={`Calls: ${callPct}%`}
          />
          <div
            className="bg-loss transition-all"
            style={{ width: `${putPct}%` }}
            title={`Puts: ${putPct}%`}
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground mt-1">
          <span>Calls {callPct}%</span>
          <span>Puts {putPct}%</span>
        </div>
      </div>

      {/* Current Price */}
      {currentPrice > 0 && (
        <div className="text-sm text-muted-foreground">
          Current Price: <span className="font-semibold tabular-nums text-foreground">{fmtPrice(currentPrice)}</span>
          <span className="text-xs text-foreground dark:text-primary ml-2">(highlighted line in table marks nearest strike)</span>
        </div>
      )}

      {/* View Toggle */}
      <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit" role="group" aria-label="Option side">
        {[
          { id: 'calls', label: 'Calls' },
          { id: 'puts', label: 'Puts' },
          { id: 'both', label: 'Both' },
        ].map((btn) => (
          <button
            key={btn.id}
            type="button"
            aria-pressed={view === btn.id}
            onClick={() => setView(btn.id)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              view === btn.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Options Tables */}
      {(view === 'calls' || view === 'both') && (
        <SectionCard
          title={<span className="text-gain">Calls <span className="tabular-nums">({data.calls?.length || 0})</span></span>}
          contentClassName="p-2"
        >
          {renderTable(data.calls, 'calls')}
        </SectionCard>
      )}

      {(view === 'puts' || view === 'both') && (
        <SectionCard
          title={<span className="text-loss">Puts <span className="tabular-nums">({data.puts?.length || 0})</span></span>}
          contentClassName="p-2"
        >
          {renderTable(data.puts, 'puts')}
        </SectionCard>
      )}
    </div>
  );
};

export default OptionsTab;
