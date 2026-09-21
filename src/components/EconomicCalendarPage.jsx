import React, { useState, useMemo } from 'react';
import { ECONOMIC_EVENTS } from '../data/economicEvents';
import { CalendarX } from 'lucide-react';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { segmentClass } from '@/lib/segment';
import { cn } from '@/lib/utils';

const COUNTRY_FLAGS = { IN: '\ud83c\uddee\ud83c\uddf3', US: '\ud83c\uddfa\ud83c\uddf8', EU: '\ud83c\uddea\ud83c\uddfa', JP: '\ud83c\uddef\ud83c\uddf5' };
const COUNTRY_FILTERS = ['All', 'India', 'US', 'EU', 'Japan'];
const IMPACT_FILTERS = ['All', 'High', 'Medium'];

function getNextDate(dates) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const d of dates) {
    const date = new Date(d + 'T00:00:00');
    if (date >= today) return d;
  }
  return null;
}

function getMostRecentPastDate(dates) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let latest = null;
  for (const d of dates) {
    const date = new Date(d + 'T00:00:00');
    if (date < today) latest = d;
  }
  return latest;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} ago`;
  return `in ${diff} day${diff > 1 ? 's' : ''}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

const impactVariant = (impact) => {
  if (impact === 'High') return 'loss';
  if (impact === 'Medium') return 'warning';
  return 'secondary';
};

const EconomicCalendarPage = () => {
  const [countryFilter, setCountryFilter] = useState('All');
  const [impactFilter, setImpactFilter] = useState('All');

  const events = useMemo(() => {
    const processed = ECONOMIC_EVENTS
      .filter(ev => {
        if (countryFilter === 'India' && ev.country !== 'IN') return false;
        if (countryFilter === 'US' && ev.country !== 'US') return false;
        if (countryFilter === 'EU' && ev.country !== 'EU') return false;
        if (countryFilter === 'Japan' && ev.country !== 'JP') return false;
        if (impactFilter !== 'All' && ev.impact !== impactFilter) return false;
        return true;
      })
      .map(ev => {
        const nextDate = getNextDate(ev.dates);
        const pastDate = getMostRecentPastDate(ev.dates);
        return {
          ...ev,
          nextDate,
          pastDate,
          sortDate: nextDate || pastDate || '9999-12-31',
          isUpcoming: !!nextDate,
        };
      })
      .sort((a, b) => {
        // Upcoming first, sorted by next date
        if (a.isUpcoming && !b.isUpcoming) return -1;
        if (!a.isUpcoming && b.isUpcoming) return 1;
        return a.sortDate.localeCompare(b.sortDate);
      });
    return processed;
  }, [countryFilter, impactFilter]);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Economic Calendar" description="Key economic events and data releases" />

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <span id="econ-country-label" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Country</span>
          <div role="group" aria-labelledby="econ-country-label" className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {COUNTRY_FILTERS.map(f => (
              <button
                key={f}
                type="button"
                aria-pressed={countryFilter === f}
                onClick={() => setCountryFilter(f)}
                className={segmentClass(countryFilter === f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span id="econ-impact-label" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impact</span>
          <div role="group" aria-labelledby="econ-impact-label" className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {IMPACT_FILTERS.map(f => (
              <button
                key={f}
                type="button"
                aria-pressed={impactFilter === f}
                onClick={() => setImpactFilter(f)}
                className={segmentClass(impactFilter === f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No events match your filters"
          description="Try adjusting country or impact filters"
        />
      ) : (
        <div className="space-y-2">
          {events.map((ev, idx) => {
            const displayDate = ev.nextDate || ev.pastDate;
            const past = displayDate ? isPast(displayDate) : true;
            return (
              <div
                key={`${ev.name}-${idx}`}
                className={cn(
                  'rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20',
                  past && 'opacity-50',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg" role="img" aria-label={ev.country}>
                        {COUNTRY_FLAGS[ev.country] || ev.country}
                      </span>
                      <span className="font-semibold">{ev.name}</span>
                      <Badge variant={impactVariant(ev.impact)}>{ev.impact}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{ev.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {displayDate && (
                      <>
                        <div className="text-sm text-foreground/85 tabular-nums">{formatDate(displayDate)}</div>
                        <div className={cn(
                          'text-xs font-medium mt-0.5 tabular-nums',
                          past ? 'text-muted-foreground' : 'text-foreground',
                        )}>
                          {daysUntil(displayDate)}
                        </div>
                      </>
                    )}
                    {!displayDate && (
                      <span className="text-xs text-muted-foreground">No upcoming dates</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
};

export default EconomicCalendarPage;
