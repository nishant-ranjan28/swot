import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import PriceChart from './PriceChart';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import PriceChange from '@/components/common/PriceChange';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { cn } from '@/lib/utils';
import { selectClass } from '@/lib/select';

const TH_CLASS = 'px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

function EtfPage() {
  const { market } = useMarket();
  const [etfs, setEtfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);

  // Overlap
  const [overlapMode, setOverlapMode] = useState(false);
  const [overlapEtf1, setOverlapEtf1] = useState('');
  const [overlapEtf2, setOverlapEtf2] = useState('');
  const [overlapResult, setOverlapResult] = useState(null);
  const [loadingOverlap, setLoadingOverlap] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedEtf(null);
    setHoldings(null);
    api.get(`/api/stocks/etfs?market=${market}`)
      .then(res => setEtfs(res.data.etfs || []))
      .catch(() => setError('Failed to load ETF data'))
      .finally(() => setLoading(false));
  }, [market]);

  const selectEtf = (etf) => {
    setSelectedEtf(etf);
    setLoadingHoldings(true);
    setHoldings(null);
    api.get(`/api/stocks/etf/${encodeURIComponent(etf.symbol)}/holdings`)
      .then(res => setHoldings(res.data))
      .catch(() => setHoldings(null))
      .finally(() => setLoadingHoldings(false));
  };

  const checkOverlap = () => {
    if (!overlapEtf1 || !overlapEtf2 || overlapEtf1 === overlapEtf2) return;
    setLoadingOverlap(true);
    setOverlapResult(null);
    api.get(`/api/stocks/etf/overlap?symbols=${encodeURIComponent(overlapEtf1)},${encodeURIComponent(overlapEtf2)}`)
      .then(res => setOverlapResult(res.data))
      .catch(() => setOverlapResult(null))
      .finally(() => setLoadingOverlap(false));
  };

  const currency = market === 'in' ? '₹' : '$';

  return (
    <PageContainer>
      <PageHeader
        title="ETF Screener"
        description={`Popular ${market === 'in' ? 'Indian' : 'US'} ETFs with holdings & overlap analysis`}
        actions={
          <Button
            type="button"
            variant={overlapMode ? 'default' : 'secondary'}
            aria-pressed={overlapMode}
            onClick={() => { setOverlapMode(!overlapMode); setSelectedEtf(null); }}
          >
            {overlapMode ? 'Back to ETFs' : 'Overlap Checker'}
          </Button>
        }
      />

      {error && <ErrorState title={error} />}

      {/* Overlap Checker */}
      {overlapMode && (
        <div className="space-y-4">
          <SectionCard
            title="ETF Overlap Checker"
            description="Compare holdings of two ETFs to find common positions"
          >
            {market === 'in' && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" aria-hidden />
                <span className="text-foreground/85">
                  Holdings and overlap data is only available for US ETFs. Switch to US market to use this feature.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label htmlFor="etf-overlap-1" className="block text-xs font-medium text-muted-foreground mb-1">ETF 1</label>
                <select
                  id="etf-overlap-1"
                  value={overlapEtf1}
                  onChange={e => setOverlapEtf1(e.target.value)}
                  className={cn(selectClass, 'w-full')}
                >
                  <option value="">Select ETF</option>
                  {etfs.map(e => (
                    <option key={e.symbol} value={e.symbol}>{e.symbol} - {e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="etf-overlap-2" className="block text-xs font-medium text-muted-foreground mb-1">ETF 2</label>
                <select
                  id="etf-overlap-2"
                  value={overlapEtf2}
                  onChange={e => setOverlapEtf2(e.target.value)}
                  className={cn(selectClass, 'w-full')}
                >
                  <option value="">Select ETF</option>
                  {etfs.map(e => (
                    <option key={e.symbol} value={e.symbol}>{e.symbol} - {e.name}</option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                onClick={checkOverlap}
                disabled={!overlapEtf1 || !overlapEtf2 || overlapEtf1 === overlapEtf2 || loadingOverlap}
              >
                {loadingOverlap ? 'Analyzing...' : 'Check Overlap'}
              </Button>
            </div>
          </SectionCard>

          {overlapResult && (
            <SectionCard
              title="Overlap Results"
              action={
                <span className="text-sm font-semibold tabular-nums">
                  {overlapResult.overlap_count || 0} common holdings
                </span>
              }
              contentClassName="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                      {overlapResult.etf1?.symbol}
                    </span>
                  }
                  value={`${overlapResult.etf1_total || 0} holdings`}
                  className="bg-muted/40"
                />
                <StatCard label="Common" value={overlapResult.overlap_count || 0} className="bg-muted/40" />
                <StatCard
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-chart-2" aria-hidden />
                      {overlapResult.etf2?.symbol}
                    </span>
                  }
                  value={`${overlapResult.etf2_total || 0} holdings`}
                  className="bg-muted/40"
                />
              </div>
              {overlapResult.common_holdings?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Common Holdings</h4>
                  <div className="flex flex-wrap gap-2">
                    {overlapResult.common_holdings.map((h, i) => (
                      <Badge key={i} variant="secondary">{h}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(!overlapResult.common_holdings || overlapResult.common_holdings.length === 0) && (
                <p className="text-muted-foreground text-sm text-center">No common holdings found (holdings data may be limited)</p>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* ETF Detail */}
      {selectedEtf && !overlapMode && (
        <div className="space-y-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => { setSelectedEtf(null); setHoldings(null); }}
          >
            <ArrowLeft aria-hidden />
            Back to all ETFs
          </Button>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">{selectedEtf.name}</h2>
                <Link to={`/stock/${selectedEtf.symbol}`} className="text-sm font-medium text-foreground underline-offset-4 hover:underline dark:text-primary">
                  {selectedEtf.symbol}
                </Link>
                <Badge variant="secondary" className="ml-2">{selectedEtf.category}</Badge>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">
                  {currency}{selectedEtf.price?.toFixed(2) || 'N/A'}
                </div>
                <PriceChange percent={selectedEtf.change_percent || 0} className="text-sm font-medium" />
              </div>
            </div>
          </section>

          {/* Price Chart */}
          <PriceChart symbol={selectedEtf.symbol} title={`${selectedEtf.name} Price Chart`} decimals={2} />

          {/* Holdings */}
          <SectionCard title="Fund Details & Holdings">
            {loadingHoldings ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-3/4" />)}
              </div>
            ) : holdings ? (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {holdings.total_assets && (
                    <StatCard
                      label="Total Assets"
                      className="bg-muted/40"
                      value={holdings.total_assets >= 1e9
                        ? `${currency}${(holdings.total_assets / 1e9).toFixed(2)}B`
                        : holdings.total_assets >= 1e6
                          ? `${currency}${(holdings.total_assets / 1e6).toFixed(1)}M`
                          : `${currency}${holdings.total_assets?.toLocaleString()}`}
                    />
                  )}
                  {holdings.expense_ratio != null && (
                    <StatCard label="Expense Ratio" className="bg-muted/40" value={`${(holdings.expense_ratio * 100).toFixed(2)}%`} />
                  )}
                  {holdings.ytd_return != null && (
                    <StatCard label="YTD Return" className="bg-muted/40" value={<PriceChange percent={holdings.ytd_return * 100} />} />
                  )}
                  {holdings.three_year_return != null && (
                    <StatCard label="3Y Return" className="bg-muted/40" value={<PriceChange percent={holdings.three_year_return * 100} />} />
                  )}
                </div>

                {holdings.top_holdings?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Top Holdings</h4>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className={TH_CLASS}>Symbol</TableHead>
                            <TableHead className={TH_CLASS}>Name</TableHead>
                            <TableHead className={cn(TH_CLASS, 'text-right')}>Weight</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {holdings.top_holdings.map((h, i) => (
                            <TableRow key={i}>
                              <TableCell className="px-3">
                                <Link to={`/stock/${h.symbol}`} className="font-medium text-foreground underline-offset-4 hover:underline dark:text-primary">
                                  {h.symbol || '-'}
                                </Link>
                              </TableCell>
                              <TableCell className="px-3">{h.name || '-'}</TableCell>
                              <TableCell className="px-3 text-right font-medium tabular-nums text-muted-foreground">
                                {h.weight != null ? `${h.weight}%` : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                {(!holdings.top_holdings || holdings.top_holdings.length === 0) && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    Holdings data not available for this ETF.
                    {market === 'in' && ' Indian ETF holdings are not provided by Yahoo Finance.'}
                  </p>
                )}
              </div>
            ) : (
              <ErrorState title="Failed to load holdings data" />
            )}
          </SectionCard>
        </div>
      )}

      {/* ETF Grid */}
      {!selectedEtf && !overlapMode && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : etfs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {etfs.map(etf => (
                <button
                  key={etf.symbol}
                  type="button"
                  onClick={() => selectEtf(etf)}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold">{etf.symbol.replace('.NS', '')}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{etf.name}</div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{etf.category}</Badge>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-lg font-bold tabular-nums">
                      {etf.price ? `${currency}${etf.price.toFixed(2)}` : 'N/A'}
                    </span>
                    <PriceChange percent={etf.change_percent || 0} className="text-sm font-semibold" />
                  </div>
                  {etf.volume && (
                    <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                      Vol: {(etf.volume / 1000).toFixed(0)}K
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No ETF data available" />
          )}
        </>
      )}

      {/* Disclaimer */}
      <p className="pt-2 text-xs text-muted-foreground text-center">
        Data sourced from Yahoo Finance. ETF prices and holdings may be delayed. Not financial advice.
      </p>
    </PageContainer>
  );
}

export default EtfPage;
