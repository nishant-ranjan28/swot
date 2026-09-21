import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useWatchlist } from '../context/UserDataContext';
import { useMarket } from '../context/MarketContext';
import Sparkline from './Sparkline';
import { AlertTriangle, Newspaper, Plus, Search, Star, Trash2, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import PriceChange from '@/components/common/PriceChange';
import RangeBar from '@/components/common/RangeBar';
import { cn } from '@/lib/utils';
import { selectClass } from '@/lib/select';

const MAX_WATCHLIST = 20;

const SORT_OPTIONS = [
  { key: 'addedAt', label: 'Recently Added' },
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'changePercent', label: 'Change%' },
];

const SkeletonRow = () => (
  <TableRow>
    <TableCell className="px-4 py-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16 mt-1" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-[30px] w-[80px]" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-1.5 w-28 rounded-full" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-4 w-16" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-4 w-8" /></TableCell>
    <TableCell className="px-4 py-3"><Skeleton className="h-4 w-8" /></TableCell>
  </TableRow>
);

const TechnicalSignals = ({ watchlist }) => {
  const [techAlerts, setTechAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (watchlist.length === 0) {
      setLoading(false);
      return;
    }
    const fetchAlerts = async () => {
      setLoading(true);
      try {
        const symbolsParam = watchlist.map((w) => w.symbol).join(',');
        const res = await api.get(`/api/stocks/technical-alerts?symbols=${encodeURIComponent(symbolsParam)}`);
        setTechAlerts(res.data.alerts || []);
      } catch {
        setTechAlerts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, [watchlist]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-48 mb-3" />
        <div className="flex gap-3 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-64 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <Zap className="size-4 text-muted-foreground" aria-hidden />
          Technical Signals
        </span>
      }
    >
      {techAlerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No technical signals detected on your watchlist stocks.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {techAlerts.map((alert, idx) => (
            <Link
              key={`${alert.symbol}-${alert.alert}-${idx}`}
              to={`/stock/${alert.symbol}`}
              className={cn(
                'shrink-0 w-72 rounded-lg border p-3 transition-colors',
                alert.type === 'bullish'
                  ? 'border-gain/30 bg-gain/5 hover:bg-gain/10'
                  : 'border-loss/30 bg-loss/5 hover:bg-loss/10',
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-sm">{alert.name}</span>
                <Badge
                  variant={alert.type === 'bullish' ? 'gain' : 'loss'}
                  className="text-[10px] font-bold uppercase tracking-wide"
                >
                  {alert.type}
                </Badge>
              </div>
              <div className="text-xs font-medium text-foreground/85 mb-1">{alert.alert}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{alert.description}</div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
};

const WatchlistPage = () => {
  const { market } = useMarket();
  const [watchlist, setWatchlist] = useWatchlist(market);
  const [quotes, setQuotes] = useState({});
  const [sparklineData, setSparklineData] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sortBy, setSortBy] = useState('addedAt');
  const [alerts, setAlerts] = useState([]);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Fetch live quotes and sparkline data for all watchlist stocks
  const fetchQuotesAndSparklines = useCallback(async (list) => {
    if (list.length === 0) return;
    setLoadingQuotes(true);
    const quoteResults = {};
    const sparkResults = {};

    // Fetch all quotes in a single batch call
    const symbolsParam = list.map((item) => item.symbol).join(',');
    const [batchRes, ...histResponses] = await Promise.all([
      api.get(`/api/stocks/batch?symbols=${encodeURIComponent(symbolsParam)}`).catch(() => ({ data: null })),
      ...list.map((item) =>
        api.get(`/api/stocks/${item.symbol}/history?range=5d`).catch(() => ({ data: null }))
      ),
    ]);

    // Map batch quotes
    if (batchRes.data && batchRes.data.quotes) {
      Object.entries(batchRes.data.quotes).forEach(([sym, quote]) => {
        quoteResults[sym] = quote;
      });
    }

    // Map sparkline data
    list.forEach((item, idx) => {
      const histRes = histResponses[idx];
      if (histRes.data && histRes.data.data && Array.isArray(histRes.data.data)) {
        sparkResults[item.symbol] = histRes.data.data.map((d) => d.close).filter((v) => v != null);
      } else if (histRes.data && Array.isArray(histRes.data.prices)) {
        sparkResults[item.symbol] = histRes.data.prices.map((d) => d.close).filter((v) => v != null);
      }
    });

    setQuotes(quoteResults);
    setSparklineData(sparkResults);
    setLoadingQuotes(false);
  }, []);

  useEffect(() => {
    fetchQuotesAndSparklines(watchlist);
  }, [watchlist, fetchQuotesAndSparklines]);

  // Check price alerts when quotes load
  useEffect(() => {
    if (Object.keys(quotes).length === 0) return;
    const triggered = [];
    watchlist.forEach((item) => {
      const q = quotes[item.symbol];
      if (!q || !q.price) return;
      if (item.alertHigh && q.price >= item.alertHigh) {
        triggered.push(`${item.name || item.symbol.replace('.NS', '')} crossed \u20B9${item.alertHigh} target!`);
      }
      if (item.alertLow && q.price <= item.alertLow) {
        triggered.push(`${item.name || item.symbol.replace('.NS', '')} fell below \u20B9${item.alertLow}!`);
      }
    });
    setAlerts(triggered);
  }, [quotes, watchlist]);

  // Debounced search
  useEffect(() => {
    if (searchInput.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(searchInput)}&market=${market}`);
        setSearchResults((res.data.results || []).slice(0, 6));
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, market]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addToWatchlist = (stock) => {
    if (watchlist.length >= MAX_WATCHLIST) return;
    if (watchlist.some((w) => w.symbol === stock.symbol)) return;
    setWatchlist([
      ...watchlist,
      { symbol: stock.symbol, name: stock.name, alertHigh: null, alertLow: null, addedAt: new Date().toISOString() },
    ]);
    setSearchInput('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const removeFromWatchlist = (symbol) => {
    setWatchlist(watchlist.filter((w) => w.symbol !== symbol));
    setQuotes((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  };

  const updateAlert = (symbol, field, value) => {
    const numVal = value === '' ? null : parseFloat(value);
    setWatchlist(watchlist.map((w) => (w.symbol === symbol ? { ...w, [field]: numVal } : w)));
  };

  // Sorted watchlist
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'price') {
      const pa = quotes[a.symbol]?.price || 0;
      const pb = quotes[b.symbol]?.price || 0;
      return pb - pa;
    }
    if (sortBy === 'changePercent') {
      const ca = quotes[a.symbol]?.change_percent || 0;
      const cb = quotes[b.symbol]?.change_percent || 0;
      return cb - ca;
    }
    // addedAt - most recent first
    return new Date(b.addedAt) - new Date(a.addedAt);
  });

  const alreadyInWatchlist = (symbol) => watchlist.some((w) => w.symbol === symbol);

  return (
    <PageContainer>
      <PageHeader
        title="Watchlist"
        description={`${watchlist.length} / ${MAX_WATCHLIST} stocks`}
        actions={
          <>
            <label htmlFor="watchlist-sort" className="text-xs font-medium text-muted-foreground">Sort by:</label>
            <select
              id="watchlist-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={selectClass}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </>
        }
      />

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-5 shrink-0 mt-0.5 text-warning" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Price Alerts Triggered</h3>
              <ul className="mt-1 space-y-0.5">
                {alerts.map((msg, i) => (
                  <li key={i} className="text-sm text-foreground/85">{msg}</li>
                ))}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAlerts([])}
              className="ml-auto -mt-1 -mr-1 size-8"
              aria-label="Dismiss"
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {/* Add Stock Section */}
      <SectionCard title="Add Stock to Watchlist" className="relative z-10">
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
            <Input
              type="text"
              className="h-10 pl-9 pr-9"
              placeholder="Search for stocks (e.g., Reliance, TCS, HDFC)..."
              aria-label="Search stocks"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              disabled={watchlist.length >= MAX_WATCHLIST}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearchResults([]); setShowDropdown(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-hidden"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {watchlist.length >= MAX_WATCHLIST && (
            <p className="text-xs text-loss mt-1">Watchlist is full (max {MAX_WATCHLIST} stocks).</p>
          )}

          {showDropdown && searchResults.length > 0 && (
            <ul className="absolute z-40 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
              {searchResults.map((stock) => {
                const exists = alreadyInWatchlist(stock.symbol);
                return (
                  <li key={stock.symbol} className="list-none">
                    <button
                      disabled={exists}
                      className={cn(
                        'p-3 flex justify-between items-center w-full text-left border-b border-border last:border-b-0 transition-colors focus:outline-hidden',
                        exists ? 'opacity-50 cursor-not-allowed bg-muted/40' : 'cursor-pointer hover:bg-muted',
                      )}
                      onClick={() => !exists && addToWatchlist(stock)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-medium text-sm">{stock.name}</span>
                        <span className="text-xs text-muted-foreground">({stock.symbol})</span>
                      </div>
                      {exists ? (
                        <span className="text-xs text-muted-foreground font-medium ml-2">Added</span>
                      ) : (
                        <Plus className="size-5 text-muted-foreground ml-2 shrink-0" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      {/* Technical Signals */}
      {watchlist.length > 0 && <TechnicalSignals watchlist={watchlist} />}

      {/* Watchlist Table */}
      {watchlist.length === 0 ? (
        <EmptyState icon={Star} title="Your watchlist is empty. Search and add stocks above." />
      ) : (
        <SectionCard contentClassName="p-0" className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock</TableHead>
                <TableHead className="px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price</TableHead>
                <TableHead className="px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change</TableHead>
                <TableHead className="px-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">5D</TableHead>
                <TableHead className="px-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">52W Range</TableHead>
                <TableHead className="px-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alert High</TableHead>
                <TableHead className="px-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alert Low</TableHead>
                <TableHead className="px-4 w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingQuotes && Object.keys(quotes).length === 0
                ? watchlist.map((_, i) => <SkeletonRow key={i} />)
                : sortedWatchlist.map((item) => {
                    const q = quotes[item.symbol];
                    const price = q?.price;
                    const change = q?.change;
                    const changePercent = q?.change_percent;
                    const low52 = q?.week52_low || q?.fiftyTwoWeekLow;
                    const high52 = q?.week52_high || q?.fiftyTwoWeekHigh;
                    const highTriggered = item.alertHigh && price && price >= item.alertHigh;
                    const lowTriggered = item.alertLow && price && price <= item.alertLow;

                    return (
                      <TableRow key={item.symbol}>
                        <TableCell className="px-4 py-3">
                          <Link to={`/stock/${item.symbol}`} className="underline-offset-4 hover:underline">
                            <div className="font-semibold text-sm">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.symbol?.replace('.NS', '')}</div>
                          </Link>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          {price != null ? (
                            <span className="font-semibold tabular-nums">
                              {'\u20B9'}{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          {change != null ? (
                            <PriceChange value={change} percent={changePercent} className="font-semibold" />
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex justify-center">
                            {sparklineData[item.symbol] && sparklineData[item.symbol].length >= 2 ? (
                              <Sparkline data={sparklineData[item.symbol]} />
                            ) : (
                              <Skeleton className="w-[80px] h-[30px] rounded-sm" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex justify-center">
                            {/* Same guard as RangeBar; the N/A fallback is Watchlist-specific. */}
                            {!low52 || !high52 || !price || high52 === low52 ? (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            ) : (
                              <RangeBar
                                className="w-28"
                                low={low52}
                                high={high52}
                                value={price}
                                lowLabel={low52.toFixed(0)}
                                highLabel={high52.toFixed(0)}
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              value={item.alertHigh ?? ''}
                              onChange={(e) => updateAlert(item.symbol, 'alertHigh', e.target.value)}
                              placeholder="--"
                              aria-label={`Alert high for ${item.symbol}`}
                              className={cn('h-8 w-24 text-right tabular-nums', highTriggered && 'border-warning bg-warning/10')}
                            />
                            {highTriggered && (
                              <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Alert triggered" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              value={item.alertLow ?? ''}
                              onChange={(e) => updateAlert(item.symbol, 'alertLow', e.target.value)}
                              placeholder="--"
                              aria-label={`Alert low for ${item.symbol}`}
                              className={cn('h-8 w-24 text-right tabular-nums', lowTriggered && 'border-warning bg-warning/10')}
                            />
                            {lowTriggered && (
                              <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Alert triggered" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromWatchlist(item.symbol)}
                            className="size-8 text-muted-foreground hover:text-loss"
                            aria-label={`Remove ${item.symbol}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
              }
            </TableBody>
          </Table>
        </SectionCard>
      )}
      {/* Watchlist News */}
      {watchlist.length > 0 && <WatchlistNews watchlist={watchlist} />}
    </PageContainer>
  );
};

// ===== Watchlist News Component =====
const WatchlistNews = ({ watchlist }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (watchlist.length === 0) return;
    const fetchNews = async () => {
      setLoading(true);
      const allArticles = [];
      const seen = new Set();
      const symbols = watchlist.slice(0, 8).map(w => w.symbol);

      await Promise.all(symbols.map(async (sym) => {
        try {
          const res = await api.get(`/api/stocks/news/${sym}`);
          const stockLabel = sym.replace('.NS', '').replace('.BO', '');
          (res.data.articles || []).forEach(a => {
            if (!seen.has(a.title)) {
              seen.add(a.title);
              allArticles.push({ ...a, forStock: stockLabel });
            }
          });
        } catch {}
      }));
      allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      setNews(allArticles.slice(0, 10));
      setLoading(false);
    };
    fetchNews();
  }, [watchlist]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now - date) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-48 mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-16 h-12 shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-2 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (news.length === 0) return null;

  return (
    <SectionCard
      title="News for Your Watchlist"
      action={
        <Link to="/news" className="text-xs font-medium text-foreground dark:text-primary hover:underline">
          All news
        </Link>
      }
      contentClassName="p-2"
    >
      <div className="space-y-1">
        {news.map((article, idx) => (
          <a key={idx} href={article.url} target="_blank" rel="noopener noreferrer"
            className="group flex gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
            {article.image ? (
              <div className="w-16 h-12 shrink-0 rounded-md overflow-hidden bg-muted">
                <img src={article.image} alt="" className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            ) : (
              <div className="w-16 h-12 shrink-0 rounded-md bg-muted flex items-center justify-center">
                <Newspaper className="size-5 text-muted-foreground/60" aria-hidden />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium line-clamp-1 group-hover:text-foreground dark:group-hover:text-primary transition-colors">
                {article.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px]">
                  {article.forStock}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {article.source} · {formatDate(article.published_at)}
                </span>
                {article.sentiment_label && (
                  <Badge
                    variant={article.sentiment_label === 'Bullish' ? 'gain' : article.sentiment_label === 'Bearish' ? 'loss' : 'secondary'}
                    className="rounded-sm px-1.5 text-[10px]"
                  >
                    {article.sentiment_label}
                  </Badge>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </SectionCard>
  );
};

export default WatchlistPage;
