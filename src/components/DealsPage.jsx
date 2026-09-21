import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Search, UserSearch } from 'lucide-react';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

function DealsPage() {
  const { market } = useMarket();
  const [symbol, setSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Search suggestions as user types
  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(query)}&market=${market}`);
        setSuggestions(res.data.results || []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [searchInput, market]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchInsider = async (sym) => {
    setSymbol(sym);
    setSearchInput(sym);
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await api.get(`/api/stocks/${encodeURIComponent(sym)}/insider`);
      setTransactions(res.data.transactions || []);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(`No insider data found for ${sym}`);
      } else {
        setError('Failed to fetch insider transactions');
      }
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const sym = searchInput.trim().toUpperCase();
    if (!sym) return;
    fetchInsider(sym);
  };

  const formatValue = (val) => {
    if (!val && val !== 0) return '-';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${val.toLocaleString()}`;
  };

  const formatShares = (shares) => {
    if (!shares) return '-';
    return shares.toLocaleString();
  };

  const getTransactionColor = (txn) => {
    const lower = (txn || '').toLowerCase();
    if (lower.includes('purchase') || lower.includes('buy') || lower.includes('acquisition')) return 'text-gain';
    if (lower.includes('sale') || lower.includes('sell') || lower.includes('disposition')) return 'text-loss';
    return 'text-foreground/85';
  };

  const getTransactionBadge = (txn) => {
    const lower = (txn || '').toLowerCase();
    if (lower.includes('purchase') || lower.includes('buy') || lower.includes('acquisition')) return { text: 'BUY', variant: 'gain' };
    if (lower.includes('sale') || lower.includes('sell') || lower.includes('disposition')) return { text: 'SELL', variant: 'loss' };
    return { text: txn || 'OTHER', variant: 'secondary' };
  };

  const suggestedSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'META', 'NVDA', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS'];

  return (
    <PageContainer>
      <PageHeader
        title="Insider / Bulk / Block Deals"
        description="Track insider buying and selling activity for any stock"
      />

      {/* Search */}
      <form onSubmit={handleSearch} className="relative z-20">
        <div className="flex gap-2">
          <div className="flex-1 relative" ref={dropdownRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="Search by name or symbol (e.g., Apple, AAPL, Reliance)"
              aria-label="Search stocks"
              autoComplete="off"
              className="h-10 pl-9"
            />
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute z-40 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fetchInsider(s.symbol)}
                    className="w-full text-left px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-muted transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-sm">{s.symbol}</span>
                      <span className="text-muted-foreground text-xs ml-2">{s.name}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{s.exchange || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="submit" className="h-10 px-6" disabled={loading || !searchInput.trim()}>
            {loading ? 'Loading...' : 'Search'}
          </Button>
        </div>
      </form>

      {/* Quick suggestions */}
      {!searched && (
        <div>
          <p className="text-muted-foreground text-xs mb-2">Popular symbols:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedSymbols.map((s) => (
              <Button key={s} type="button" variant="outline" size="xs" onClick={() => fetchInsider(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && <ErrorState message={error} />}

      {/* Results */}
      {!loading && !error && searched && (
        transactions.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title={`No insider transaction data available for ${symbol}`}
            description="Try a US-listed stock like AAPL, MSFT, or TSLA"
          />
        ) : (
          <SectionCard
            title={
              <>
                Insider Transactions for <span className="text-foreground">{symbol}</span>
                <span className="text-muted-foreground text-xs font-normal ml-2 tabular-nums">({transactions.length} records)</span>
              </>
            }
            contentClassName="p-0"
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 text-muted-foreground">Date</TableHead>
                  <TableHead className="px-3 text-muted-foreground">Insider</TableHead>
                  <TableHead className="px-3 text-muted-foreground">Relation</TableHead>
                  <TableHead className="px-3 text-center text-muted-foreground">Type</TableHead>
                  <TableHead className="px-3 text-right text-muted-foreground">Shares</TableHead>
                  <TableHead className="px-4 text-right text-muted-foreground">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn, i) => {
                  const badge = getTransactionBadge(txn.transaction);
                  return (
                    <TableRow key={i}>
                      <TableCell className="px-4 py-3 tabular-nums text-foreground/85">{txn.date || '-'}</TableCell>
                      <TableCell className="px-3 py-3 font-medium">{txn.insider || '-'}</TableCell>
                      <TableCell className="px-3 py-3 text-muted-foreground">{txn.relation || '-'}</TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        <Badge variant={badge.variant}>{badge.text}</Badge>
                      </TableCell>
                      <TableCell className={cn('px-3 py-3 text-right tabular-nums', getTransactionColor(txn.transaction))}>
                        {formatShares(txn.shares)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums text-foreground/85">
                        {formatValue(txn.value)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </SectionCard>
        )
      )}

      {/* Info Note */}
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-xs text-muted-foreground">
          Note: Insider transaction data is sourced from Yahoo Finance and may have delays. Indian stocks have limited insider data availability through this source.
        </p>
      </div>
    </PageContainer>
  );
}

export default DealsPage;
