import React, { useState, useMemo } from 'react';
import { ECONOMIC_EVENTS } from '../data/economicEvents';

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
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Economic Calendar</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Key economic events and data releases</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2">Country</label>
          <div className="flex gap-2">
            {COUNTRY_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setCountryFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  countryFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2">Impact</label>
          <div className="flex gap-2">
            {IMPACT_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setImpactFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  impactFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="font-medium">No events match your filters</p>
          <p className="text-sm mt-1">Try adjusting country or impact filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev, idx) => {
            const displayDate = ev.nextDate || ev.pastDate;
            const past = displayDate ? isPast(displayDate) : true;
            return (
              <div
                key={`${ev.name}-${idx}`}
                className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-shadow hover:shadow-sm ${
                  past ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg" role="img" aria-label={ev.country}>
                        {COUNTRY_FLAGS[ev.country] || ev.country}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">{ev.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ev.impact === 'High'
                          ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {ev.impact}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{ev.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {displayDate && (
                      <>
                        <div className="text-sm text-gray-700 dark:text-gray-300">{formatDate(displayDate)}</div>
                        <div className={`text-xs font-medium mt-0.5 ${
                          past
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}>
                          {daysUntil(displayDate)}
                        </div>
                      </>
                    )}
                    {!displayDate && (
                      <span className="text-xs text-gray-400">No upcoming dates</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EconomicCalendarPage;
