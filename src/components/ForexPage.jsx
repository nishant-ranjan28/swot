import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import PriceChart from './PriceChart';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import { Input } from '@/components/ui/input';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import SelectableTile, { TileSkeleton } from '@/components/common/SelectableTile';
import { cn } from '@/lib/utils';
import { selectClass } from '@/lib/select';

const FOREX_PAIRS = [
  { symbol: 'USDINR=X', name: 'USD/INR', base: 'USD', quote: 'INR' },
  { symbol: 'EURUSD=X', name: 'EUR/USD', base: 'EUR', quote: 'USD' },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', base: 'GBP', quote: 'USD' },
  { symbol: 'USDJPY=X', name: 'USD/JPY', base: 'USD', quote: 'JPY' },
  { symbol: 'EURINR=X', name: 'EUR/INR', base: 'EUR', quote: 'INR' },
];

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY'];

const labelClass = 'mb-1 block text-xs font-medium text-muted-foreground';

function CurrencyConverter({ rates }) {
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('INR');
  const [amount, setAmount] = useState('1');

  // Build a rate map: everything relative to USD
  const rateToUSD = {};
  rateToUSD['USD'] = 1;
  Object.entries(rates).forEach(([sym, data]) => {
    const price = data?.price || data?.regularMarketPrice || 0;
    if (!price) return;
    if (sym === 'USDINR=X') { rateToUSD['INR'] = 1 / price; }
    if (sym === 'EURUSD=X') { rateToUSD['EUR'] = price; }
    if (sym === 'GBPUSD=X') { rateToUSD['GBP'] = price; }
    if (sym === 'USDJPY=X') { rateToUSD['JPY'] = 1 / price; }
  });
  // EURINR can be derived, but let's ensure we have it
  if (!rateToUSD['EUR'] && rates['EURINR=X']) {
    const eurInr = rates['EURINR=X']?.price || rates['EURINR=X']?.regularMarketPrice || 0;
    const usdInr = rates['USDINR=X']?.price || rates['USDINR=X']?.regularMarketPrice || 0;
    if (eurInr && usdInr) rateToUSD['EUR'] = eurInr / usdInr;
  }

  const convert = () => {
    const fromRate = rateToUSD[fromCurrency];
    const toRate = rateToUSD[toCurrency];
    if (!fromRate || !toRate) return null;
    const usdAmount = parseFloat(amount) * fromRate;
    return usdAmount / toRate;
  };

  const result = convert();

  return (
    <SectionCard title="Currency Converter">
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
        <div>
          <label htmlFor="fx-amount" className={labelClass}>Amount</label>
          <Input
            id="fx-amount"
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="bg-card tabular-nums"
            min="0"
            step="any"
          />
        </div>
        <div>
          <label htmlFor="fx-from" className={labelClass}>From</label>
          <select
            id="fx-from"
            value={fromCurrency}
            onChange={e => setFromCurrency(e.target.value)}
            className={cn(selectClass, 'w-full')}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fx-to" className={labelClass}>To</label>
          <select
            id="fx-to"
            value={toCurrency}
            onChange={e => setToCurrency(e.target.value)}
            className={cn(selectClass, 'w-full')}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center">
          <div className="text-xs text-muted-foreground">Converted Amount</div>
          <div className="text-xl font-semibold tabular-nums">
            {result !== null && !isNaN(result)
              ? result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
              : '--'}
          </div>
          <div className="text-xs text-muted-foreground">{toCurrency}</div>
        </div>
      </div>
    </SectionCard>
  );
}

function ForexPage() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const fetchQuotes = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all(
      FOREX_PAIRS.map(p =>
        api.get(`/api/stocks/${encodeURIComponent(p.symbol)}/quote`)
          .then(res => ({ symbol: p.symbol, data: res.data }))
          .catch(() => ({ symbol: p.symbol, data: null }))
      )
    ).then(results => {
      const map = {};
      results.forEach(r => { if (r.data) map[r.symbol] = r.data; });
      setQuotes(map);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load forex rates.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  return (
    <PageContainer>
      <PageHeader
        title="Forex Dashboard"
        description="Live exchange rates for major currency pairs"
        actions={
          <Button size="sm" onClick={fetchQuotes}>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        }
      />

      {error && <ErrorState title={error} onRetry={fetchQuotes} />}

      {/* Rate Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {FOREX_PAIRS.map(p => {
          const q = quotes[p.symbol];
          const isSelected = selected === p.symbol;
          const price = q?.price || q?.regularMarketPrice || 0;
          const changePct = q?.change_percent ?? q?.regularMarketChangePercent ?? 0;
          const change = q?.change ?? q?.regularMarketChange ?? 0;
          const isPositive = changePct >= 0;

          return (
            <SelectableTile
              key={p.symbol}
              selected={isSelected}
              onClick={() => setSelected(isSelected ? null : p.symbol)}
            >
              {loading ? (
                <TileSkeleton />
              ) : (
                <StatCard
                  label={p.name}
                  value={price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  className="h-full transition-colors"
                >
                  {/* 4-decimal value with 2-decimal percent: PriceChange uses one precision for both */}
                  <div className={cn('mt-0.5 text-xs tabular-nums', isPositive ? 'text-gain' : 'text-loss')}>
                    {isPositive ? '+' : ''}{change.toFixed(4)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                  </div>
                </StatCard>
              )}
            </SelectableTile>
          );
        })}
      </div>

      {/* Currency Converter */}
      {!loading && Object.keys(quotes).length > 0 && (
        <CurrencyConverter rates={quotes} />
      )}

      {/* Chart Section */}
      {selected && (
        <PriceChart
          symbol={selected}
          title={`${FOREX_PAIRS.find(p => p.symbol === selected)?.name} Chart`}
          decimals={4}
        />
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs text-muted-foreground">
        Data sourced from Yahoo Finance. Exchange rates are for informational purposes only and may be delayed.
        Not financial advice.
      </p>
    </PageContainer>
  );
}

export default ForexPage;
