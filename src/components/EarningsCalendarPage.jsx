import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import { CalendarDays } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { segmentClass } from '@/lib/segment';

const FILTER_TABS = ['This Week', 'Next Week', 'This Month'];

function getDateGroup(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  const d = new Date(dateStr + 'T00:00:00');
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d <= endOfWeek) return 'This Week';
  if (d <= endOfNextWeek) return 'Next Week';
  return 'Later';
}

function isInFilterRange(dateStr, filter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');

  if (filter === 'This Week') {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    return d >= today && d <= endOfWeek;
  }
  if (filter === 'Next Week') {
    const startOfNextWeek = new Date(today);
    startOfNextWeek.setDate(today.getDate() + (7 - today.getDay()) + 1);
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    return d >= startOfNextWeek && d <= endOfNextWeek;
  }
  if (filter === 'This Month') {
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d >= today && d <= endOfMonth;
  }
  return true;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const SkeletonCard = () => (
  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-3 w-1/2" />
    <Skeleton className="h-3 w-1/4" />
  </div>
);

const EarningsCalendarPage = () => {
  const { market } = useMarket();
  const [earnings, setEarnings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('This Month');

  useEffect(() => {
    const fetchEarnings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/stocks/earnings-calendar?market=${market}`);
        setEarnings(res.data.earnings || []);
      } catch (err) {
        console.error('Error fetching earnings calendar:', err);
        setError('Unable to load earnings calendar. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEarnings();
  }, [market]);

  const filtered = earnings.filter(e => isInFilterRange(e.date, activeFilter));

  // Group by date group
  const grouped = {};
  filtered.forEach(e => {
    const group = getDateGroup(e.date);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(e);
  });

  const groupOrder = ['Today', 'Tomorrow', 'This Week', 'Next Week', 'Later'];

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Earnings Calendar"
        description={`Upcoming earnings announcements for top ${market === 'us' ? 'US' : 'Indian'} stocks`}
      />

      {/* Filter Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Time range">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            type="button"
            aria-pressed={activeFilter === tab}
            onClick={() => setActiveFilter(tab)}
            className={segmentClass(activeFilter === tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Error */}
      {error && <ErrorState message={error} />}

      {/* Empty */}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming earnings found for this period"
          description="Try selecting a different time range"
        />
      )}

      {/* Grouped Results */}
      {!isLoading && !error && groupOrder.map(group => {
        const items = grouped[group];
        if (!items || items.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>
            <div className="space-y-2">
              {items.map((e, i) => (
                <div key={`${e.symbol}-${i}`} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between transition-colors hover:border-foreground/20">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/stock/${e.symbol}`}
                      className="block truncate font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      {e.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{e.symbol}</span>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-sm text-foreground/85 tabular-nums">{formatDate(e.date)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {e.eps_estimate != null ? `EPS Est: ${e.eps_estimate}` : 'EPS Est: N/A'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </PageContainer>
  );
};

export default EarningsCalendarPage;
