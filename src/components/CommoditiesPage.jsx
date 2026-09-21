import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import PriceChart from './PriceChart';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import ErrorState from '@/components/common/ErrorState';
import SelectableTile, { TileSkeleton } from '@/components/common/SelectableTile';

const COMMODITIES = [
  { symbol: 'GC=F', name: 'Gold', unit: 'oz' },
  { symbol: 'SI=F', name: 'Silver', unit: 'oz' },
  { symbol: 'CL=F', name: 'Crude Oil', unit: 'bbl' },
  { symbol: 'NG=F', name: 'Natural Gas', unit: 'MMBtu' },
  { symbol: 'HG=F', name: 'Copper', unit: 'lb' },
];

function CommoditiesPage() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const fetchQuotes = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all(
      COMMODITIES.map(c =>
        api.get(`/api/stocks/${encodeURIComponent(c.symbol)}/quote`)
          .then(res => ({ symbol: c.symbol, data: res.data }))
          .catch(() => ({ symbol: c.symbol, data: null }))
      )
    ).then(results => {
      const map = {};
      results.forEach(r => { if (r.data) map[r.symbol] = r.data; });
      setQuotes(map);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load commodity prices.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  return (
    <PageContainer>
      <PageHeader
        title="Commodities"
        description="Live prices for major commodities (USD)"
        actions={
          <Button size="sm" onClick={fetchQuotes}>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        }
      />

      {error && <ErrorState title={error} onRetry={fetchQuotes} />}

      {/* Commodity Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {COMMODITIES.map(c => {
          const q = quotes[c.symbol];
          const isSelected = selected === c.symbol;
          const price = q?.price || q?.regularMarketPrice || 0;
          const changePct = q?.change_percent ?? q?.regularMarketChangePercent ?? 0;
          const change = q?.change ?? q?.regularMarketChange ?? 0;

          return (
            <SelectableTile
              key={c.symbol}
              selected={isSelected}
              onClick={() => setSelected(isSelected ? null : c.symbol)}
            >
              {loading ? (
                <TileSkeleton />
              ) : (
                <StatCard
                  label={c.name}
                  value={`$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  change={{ value: change, percent: changePct }}
                  sub={`per ${c.unit}`}
                  className="h-full transition-colors"
                />
              )}
            </SelectableTile>
          );
        })}
      </div>

      {/* Chart Section */}
      {selected && (
        <PriceChart
          symbol={selected}
          title={`${COMMODITIES.find(c => c.symbol === selected)?.name} Price Chart`}
          decimals={2}
        />
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs text-muted-foreground">
        Data sourced from Yahoo Finance. Prices are for informational purposes only and may be delayed.
        Not financial advice.
      </p>
    </PageContainer>
  );
}

export default CommoditiesPage;
