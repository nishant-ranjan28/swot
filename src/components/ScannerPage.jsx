import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import PriceChange from '@/components/common/PriceChange';
import RangeBar from '@/components/common/RangeBar';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';

const formatNumber = (num, market = 'in') => {
  if (!num) return 'N/A';
  if (market === 'us') {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString('en-US')}`;
  }
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const StockCard = ({ stock, type, locale = 'en-IN', currencyCode = 'INR', market = 'in' }) => {
  const isNearHigh = type === 'high';

  const badgeText = isNearHigh
    ? `${Math.abs(stock.pct_from_high || 0).toFixed(1)}% from 52W High`
    : `${Math.abs(stock.pct_from_low || 0).toFixed(1)}% from 52W Low`;

  return (
    <Link
      to={`/stock/${stock.symbol}`}
      className={cn(
        'block rounded-xl border border-border border-l-2 bg-card p-4 transition-colors hover:border-foreground/20',
        isNearHigh ? 'border-l-gain hover:border-l-gain' : 'border-l-loss hover:border-l-loss',
      )}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{stock.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{stock.symbol?.replace(/\.(NS|BO)$/, '')}</div>
          {stock.sector && (
            <div className="text-[10px] text-muted-foreground mt-0.5">{stock.sector}</div>
          )}
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-semibold tabular-nums">
            {stock.price?.toLocaleString(locale, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <PriceChange percent={stock.change_percent} className="text-xs font-semibold" />
        </div>
      </div>

      <RangeBar
        className="mt-2"
        low={stock.week52_low}
        high={stock.week52_high}
        value={stock.price}
        tone={isNearHigh ? 'gain' : 'loss'}
        label="52W Range"
        lowLabel={stock.week52_low?.toLocaleString(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 })}
        highLabel={stock.week52_high?.toLocaleString(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 })}
      />

      <div className="mt-2 flex justify-between items-center">
        <span className="text-xs text-muted-foreground tabular-nums">MCap: {formatNumber(stock.market_cap, market)}</span>
        <Badge variant={isNearHigh ? 'gain' : 'loss'} className="text-[10px] tabular-nums">
          {badgeText}
        </Badge>
      </div>
    </Link>
  );
};

const SkeletonCard = () => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex justify-between">
      <div>
        <Skeleton className="mb-2 h-4 w-28" />
        <Skeleton className="mb-1 h-3 w-16" />
        <Skeleton className="h-2 w-12" />
      </div>
      <div className="text-right">
        <Skeleton className="mb-2 h-4 w-20" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
    </div>
    <Skeleton className="mt-3 h-1.5 rounded-full" />
    <div className="mt-2 flex justify-between">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-4 w-28 rounded-full" />
    </div>
  </div>
);

const ScannerPage = () => {
  const { market } = useMarket();
  const [activeTab, setActiveTab] = useState('high');
  const [nearHigh, setNearHigh] = useState([]);
  const [nearLow, setNearLow] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/stocks/52week?market=${market}`);
      const data = response.data;
      setNearHigh(data.near_high || []);
      setNearLow(data.near_low || []);
    } catch (err) {
      console.error('Failed to load 52-week data:', err);
      setError('Unable to load scanner data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeStocks = activeTab === 'high' ? nearHigh : nearLow;

  const tabClass = (tab, activeClass) => cn(
    'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
    activeTab === tab ? activeClass : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );
  const countClass = (tab) => cn(
    'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
    activeTab === tab ? 'bg-current/20 text-white' : 'bg-muted text-muted-foreground',
  );

  return (
    <PageContainer>
      <PageHeader
        title="52-Week High/Low Scanner"
        description="Stocks trading near their 52-week highs and lows"
      />

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Scan type">
        <button
          type="button"
          aria-pressed={activeTab === 'high'}
          onClick={() => setActiveTab('high')}
          className={tabClass('high', 'bg-gain text-white')}
        >
          <TrendingUp className="size-4" aria-hidden />
          Near 52W High
          {!loading && <span className={countClass('high')}>{nearHigh.length}</span>}
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'low'}
          onClick={() => setActiveTab('low')}
          className={tabClass('low', 'bg-loss text-white')}
        >
          <TrendingDown className="size-4" aria-hidden />
          Near 52W Low
          {!loading && <span className={countClass('low')}>{nearLow.length}</span>}
        </button>
      </div>

      {/* Info banner */}
      <div className={cn(
        'rounded-lg border p-3 text-sm text-foreground/85',
        activeTab === 'high' ? 'border-gain/30 bg-gain/5' : 'border-loss/30 bg-loss/5',
      )}>
        {activeTab === 'high'
          ? 'Showing stocks within 5% of their 52-week high, sorted by closest to high first.'
          : 'Showing stocks within 10% of their 52-week low, sorted by closest to low first.'
        }
      </div>

      {/* Error state */}
      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : activeStocks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {activeStocks.map((stock) => (
            <StockCard
              key={stock.symbol}
              stock={stock}
              type={activeTab}
              locale={market === 'us' ? 'en-US' : 'en-IN'}
              currencyCode={market === 'us' ? 'USD' : 'INR'}
              market={market}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="No stocks found"
          description={activeTab === 'high'
            ? 'No stocks are currently within 5% of their 52-week high.'
            : 'No stocks are currently within 10% of their 52-week low.'}
        />
      )}
    </PageContainer>
  );
};

export default ScannerPage;
