import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useMarket } from '../context/MarketContext';
import Sparkline from './Sparkline';
import { exportPortfolio } from '../utils/exportUtils';
import PortfolioImport from './PortfolioImport';
import { getSampleHoldings, SEEN_FLAG_KEY } from '../data/samplePortfolio';
import { AlertTriangle, Download, Loader2, Newspaper, Search, Trash2, Upload } from 'lucide-react';
import { useChartTheme } from '@/hooks/useChartTheme';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import PageContainer from './common/PageContainer';
import PageHeader from './common/PageHeader';
import SectionCard from './common/SectionCard';
import StatCard from './common/StatCard';
import PriceChange from './common/PriceChange';
import EmptyState from './common/EmptyState';
import ErrorState from './common/ErrorState';

const formatNumber = (num) => {
  if (num == null || isNaN(num)) return '-';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const todayStr = () => new Date().toISOString().split('T')[0];

const PieChart = ({ holdings, liveData }) => {
  const canvasRef = useRef(null);
  const ct = useChartTheme();
  const { palette } = ct;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.parentElement.clientWidth;
    const displaySize = Math.min(size, 280);
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    ctx.scale(dpr, dpr);

    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const outerR = displaySize / 2 - 10;
    const innerR = outerR * 0.55;

    // Compute values
    const items = holdings.map((h) => {
      const price = liveData[h.symbol]?.price || h.buyPrice;
      return { symbol: h.symbol, name: h.name, value: price * h.quantity };
    });
    items.sort((a, b) => b.value - a.value);

    let slices = [];
    if (items.length <= 8) {
      slices = items;
    } else {
      slices = items.slice(0, 8);
      const othersValue = items.slice(8).reduce((s, i) => s + i.value, 0);
      slices.push({ symbol: 'OTHERS', name: 'Others', value: othersValue });
    }

    const total = slices.reduce((s, i) => s + i.value, 0);
    if (total === 0) {
      ctx.clearRect(0, 0, displaySize, displaySize);
      ctx.fillStyle = ct.text;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', cx, cy);
      return;
    }

    ctx.clearRect(0, 0, displaySize, displaySize);
    let startAngle = -Math.PI / 2;

    slices.forEach((slice, i) => {
      const sweepAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweepAngle);
      ctx.arc(cx, cy, innerR, startAngle + sweepAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      startAngle += sweepAngle;
    });

    // Center hole + text
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = ct.background;
    ctx.fill();
    ctx.fillStyle = ct.foreground;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${slices.length} stocks`, cx, cy);
  }, [holdings, liveData, palette, ct]);

  return <canvas ref={canvasRef} className="mx-auto" />;
};

const PieLegend = ({ holdings, liveData }) => {
  const { palette } = useChartTheme();
  const items = holdings.map((h) => {
    const price = liveData[h.symbol]?.price || h.buyPrice;
    return { symbol: h.symbol, name: h.name, value: price * h.quantity };
  });
  items.sort((a, b) => b.value - a.value);

  let slices = [];
  if (items.length <= 8) {
    slices = items;
  } else {
    slices = items.slice(0, 8);
    const othersValue = items.slice(8).reduce((s, i) => s + i.value, 0);
    slices.push({ symbol: 'OTHERS', name: 'Others', value: othersValue });
  }

  const total = slices.reduce((s, i) => s + i.value, 0);

  return (
    <div className="flex flex-wrap gap-2 mt-3 justify-center">
      {slices.map((s, i) => (
        <div key={s.symbol} className="flex items-center gap-1.5 text-xs text-foreground/85">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: palette[i % palette.length] }}
          />
          <span className="truncate max-w-[90px]">{s.name}</span>
          <span className="text-muted-foreground tabular-nums">{total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%</span>
        </div>
      ))}
    </div>
  );
};

const PortfolioPage = () => {
  const { market } = useMarket();
  const [holdings, setHoldings] = useLocalStorage(`stockpulse_portfolio_${market}`, []);
  const [seen, setSeen] = useLocalStorage(SEEN_FLAG_KEY(market), false);
  const [watchlist] = useLocalStorage(`stockpulse_watchlist_${market}`, []);
  const isDemoMode = holdings.length === 0 && !seen;
  const displayHoldings = useMemo(
    () => (isDemoMode ? getSampleHoldings(market) : holdings),
    [isDemoMode, market, holdings],
  );
  const [liveData, setLiveData] = useState({});
  const [sparklineData, setSparklineData] = useState({});
  const [loading, setLoading] = useState(false);

  // Add holding form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyDate, setBuyDate] = useState(todayStr());
  const [addError, setAddError] = useState('');

  // Sort
  const [sortBy, setSortBy] = useState('value');
  const [importOpen, setImportOpen] = useState(false);

  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  // Fetch live prices and sparkline data
  const fetchLivePrices = useCallback(async (list, watchlistItems) => {
    if ((!list || list.length === 0) && (!watchlistItems || watchlistItems.length === 0)) return;
    setLoading(true);
    try {
      const holdingSymbols = (list || []).map(h => h.symbol);
      const watchlistSyms = (watchlistItems || []).map(w => w.symbol);
      const symbols = [...new Set([...holdingSymbols, ...watchlistSyms])];
      const sparkResults = {};

      // Fetch batch quotes, individual overviews (for sector), and sparklines
      const symbolsParam = symbols.join(',');
      const [batchRes, ...perSymbolResults] = await Promise.all([
        api.get(`/api/stocks/batch?symbols=${encodeURIComponent(symbolsParam)}`).catch(() => ({ data: null })),
        ...symbols.flatMap((sym) => [
          api.get(`/api/stocks/${sym}/overview`).catch(() => ({ data: {} })),
          api.get(`/api/stocks/${sym}/history?range=5d`).catch(() => ({ data: null })),
        ]),
      ]);

      const batchQuotes = batchRes.data?.quotes || {};

      // Process per-symbol results (overview and history come in pairs)
      const sectorMap = {};
      symbols.forEach((sym, idx) => {
        const overviewRes = perSymbolResults[idx * 2];
        const histRes = perSymbolResults[idx * 2 + 1];
        sectorMap[sym] = overviewRes.data?.sector || 'Other';
        if (histRes.data && histRes.data.data && Array.isArray(histRes.data.data)) {
          sparkResults[sym] = histRes.data.data.map((d) => d.close).filter((v) => v != null);
        } else if (histRes.data && Array.isArray(histRes.data.prices)) {
          sparkResults[sym] = histRes.data.prices.map((d) => d.close).filter((v) => v != null);
        }
      });

      const map = {};
      symbols.forEach((sym) => {
        const q = batchQuotes[sym];
        if (q) {
          map[sym] = {
            price: q.price || 0,
            change: q.change || 0,
            changePercent: q.change_percent || 0,
            name: q.name || sym,
            sector: sectorMap[sym] || 'Other',
          };
        }
      });
      setLiveData(map);
      setSparklineData(sparkResults);
    } catch (err) {
      console.error('Error fetching live prices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLivePrices(displayHoldings, watchlist);
  }, [displayHoldings, watchlist, fetchLivePrices]);

  useEffect(() => {
    setImportOpen(false);
  }, [market]);

  const handleImport = useCallback((newRows, mode) => {
    if (mode === 'replace') {
      setHoldings(newRows);
    } else {
      setHoldings((prev) => [...prev, ...newRows]);
    }
    if (newRows.length > 0) setSeen(true);
  }, [setHoldings, setSeen]);

  // Search autocomplete
  useEffect(() => {
    if (selectedStock) return;
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/stocks/search?q=${encodeURIComponent(searchQuery)}&market=${market}`);
        const results = res.data.results || [];
        setSearchResults(results.slice(0, 6));
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, market, selectedStock]);

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

  const handleSelectStock = (stock) => {
    setSelectedStock(stock);
    setSearchQuery(stock.name || stock.symbol);
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleAddHolding = () => {
    setAddError('');
    if (!selectedStock) {
      setAddError('Please search and select a stock.');
      return;
    }
    const bp = parseFloat(buyPrice);
    const qty = parseInt(quantity, 10);
    if (!bp || bp <= 0) {
      setAddError('Enter a valid buy price.');
      return;
    }
    if (!qty || qty <= 0) {
      setAddError('Enter a valid quantity.');
      return;
    }
    const newHolding = {
      symbol: selectedStock.symbol,
      name: selectedStock.name || selectedStock.symbol,
      buyPrice: bp,
      quantity: qty,
      buyDate: buyDate || todayStr(),
      id: crypto.randomUUID(),
    };
    setHoldings((prev) => [...prev, newHolding]);
    setSeen(true);
    setSelectedStock(null);
    setSearchQuery('');
    setBuyPrice('');
    setQuantity('');
    setBuyDate(todayStr());
  };

  const handleDelete = (id) => {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  // Summaries
  const totalInvested = displayHoldings.reduce((s, h) => s + h.buyPrice * h.quantity, 0);
  const totalCurrent = displayHoldings.reduce((s, h) => {
    const price = liveData[h.symbol]?.price || h.buyPrice;
    return s + price * h.quantity;
  }, 0);
  const totalPL = totalCurrent - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const dayPL = displayHoldings.reduce((s, h) => {
    const change = liveData[h.symbol]?.change || 0;
    return s + change * h.quantity;
  }, 0);

  // Sorted holdings
  const sortedHoldings = [...displayHoldings].sort((a, b) => {
    const priceA = liveData[a.symbol]?.price || a.buyPrice;
    const priceB = liveData[b.symbol]?.price || b.buyPrice;
    const valA = priceA * a.quantity;
    const valB = priceB * b.quantity;
    const plPctA = a.buyPrice > 0 ? ((priceA - a.buyPrice) / a.buyPrice) * 100 : 0;
    const plPctB = b.buyPrice > 0 ? ((priceB - b.buyPrice) / b.buyPrice) * 100 : 0;
    const allocA = totalCurrent > 0 ? valA / totalCurrent : 0;
    const allocB = totalCurrent > 0 ? valB / totalCurrent : 0;

    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'value':
        return valB - valA;
      case 'pl':
        return plPctB - plPctA;
      case 'allocation':
        return allocB - allocA;
      default:
        return 0;
    }
  });

  const plColor = (val) => (val >= 0 ? 'text-gain' : 'text-loss');

  const holdingActions = displayHoldings.length > 0 && (
    <>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} title="Import holdings from CSV">
        <Upload aria-hidden />
        Import CSV
      </Button>
      {!isDemoMode && (
        <Button variant="outline" size="sm" onClick={() => exportPortfolio(holdings, liveData)} title="Export holdings to CSV">
          <Download aria-hidden />
          Export CSV
        </Button>
      )}
    </>
  );

  const sortControl = (
    <div className="flex items-center gap-1" role="group" aria-label="Sort holdings">
      <span className="mr-1 text-xs text-muted-foreground" aria-hidden>Sort:</span>
      {[
        { key: 'name', label: 'Name' },
        { key: 'value', label: 'Value' },
        { key: 'pl', label: 'P&L%' },
        { key: 'allocation', label: 'Alloc' },
      ].map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => setSortBy(opt.key)}
          aria-pressed={sortBy === opt.key}
          className={cn(
            'rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
            sortBy === opt.key
              ? 'bg-primary font-medium text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const stockLinkClass = 'text-sm font-medium text-foreground underline-offset-4 hover:underline';

  return (
    <PageContainer>
      <PageHeader
        title="Portfolio"
        description="Track your virtual stock portfolio performance"
        actions={holdingActions || undefined}
      />

      {/* Add Holding Section */}
      <SectionCard title="Add Holding">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {/* Stock search */}
          <div className="lg:col-span-2 relative" ref={dropdownRef}>
            <label htmlFor="portfolio-stock-search" className="mb-1 block text-xs font-medium text-muted-foreground">Stock</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
              <Input
                id="portfolio-stock-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedStock(null);
                }}
                placeholder="Search stock..."
                className="pl-9"
                autoComplete="off"
              />
            </div>
            {showDropdown && searchResults.length > 0 && (
              <ul className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
                {searchResults.map((stock) => (
                  <li key={stock.symbol}>
                    <button
                      type="button"
                      className="w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted focus-visible:bg-muted focus-visible:outline-hidden"
                      onClick={() => handleSelectStock(stock)}
                    >
                      <span className="font-medium text-foreground">{stock.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{stock.symbol}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Buy Price */}
          <div>
            <label htmlFor="portfolio-buy-price" className="mb-1 block text-xs font-medium text-muted-foreground">Buy Price</label>
            <Input
              id="portfolio-buy-price"
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="tabular-nums"
            />
          </div>

          {/* Quantity */}
          <div>
            <label htmlFor="portfolio-quantity" className="mb-1 block text-xs font-medium text-muted-foreground">Quantity</label>
            <Input
              id="portfolio-quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              min="1"
              step="1"
              className="tabular-nums"
            />
          </div>

          {/* Buy Date */}
          <div>
            <label htmlFor="portfolio-buy-date" className="mb-1 block text-xs font-medium text-muted-foreground">Buy Date</label>
            <Input
              id="portfolio-buy-date"
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              max={todayStr()}
              className="tabular-nums"
            />
          </div>
        </div>
        {addError && <p className="mt-2 text-sm text-loss">{addError}</p>}
        <Button onClick={handleAddHolding} className="mt-4">
          Add Holding
        </Button>
      </SectionCard>

      {/* Empty state */}
      {displayHoldings.length === 0 && (
        <EmptyState title="No holdings yet." description="Add your first stock above." />
      )}

      {displayHoldings.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Total Invested" value={formatNumber(totalInvested)} />
            <StatCard label="Current Value" value={loading ? '...' : formatNumber(totalCurrent)} />
            <StatCard
              label="Total P&L"
              value={(
                <span className={loading ? undefined : plColor(totalPL)}>
                  {loading ? '...' : `${totalPL >= 0 ? '+' : ''}${formatNumber(totalPL)}`}
                </span>
              )}
              change={loading ? undefined : { percent: totalPLPercent }}
            />
            <StatCard
              label="Day's P&L"
              value={(
                <span className={loading ? undefined : plColor(dayPL)}>
                  {loading ? '...' : `${dayPL >= 0 ? '+' : ''}${formatNumber(dayPL)}`}
                </span>
              )}
            />
          </div>

          {/* Allocation Chart + Sort */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SectionCard title="Allocation" className="lg:col-span-1">
              <PieChart holdings={displayHoldings} liveData={liveData} />
              <PieLegend holdings={displayHoldings} liveData={liveData} />
            </SectionCard>

            {/* Sort + Holdings Table */}
            <div className="lg:col-span-2 space-y-3">
              {isDemoMode && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Sample portfolio for preview only.</span>{' '}
                  Add your first holding (or import a CSV) and this sample disappears — only your own holdings will be tracked from then on.
                </div>
              )}

              {/* Mobile header (the desktop header lives in the table card) */}
              <div className="flex flex-wrap items-center justify-between gap-2 md:hidden">
                <h2 className="text-sm font-semibold">Holdings ({displayHoldings.length})</h2>
                {sortControl}
              </div>

              {/* Desktop Table */}
              <SectionCard
                title={`Holdings (${displayHoldings.length})`}
                action={sortControl}
                className="hidden md:block"
                contentClassName="p-0"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs uppercase hover:bg-muted/40">
                      <TableHead className="px-4 text-muted-foreground">Stock</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">Qty</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">Avg Buy</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">CMP</TableHead>
                      <TableHead className="px-3 text-center text-muted-foreground">5D</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">Invested</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">Current</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">P&L</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">Day Chg</TableHead>
                      <TableHead className="px-3 text-right text-muted-foreground">Alloc%</TableHead>
                      <TableHead className="px-3"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedHoldings.map((h) => {
                      const live = liveData[h.symbol];
                      const currentPrice = live?.price || h.buyPrice;
                      const invested = h.buyPrice * h.quantity;
                      const current = currentPrice * h.quantity;
                      const pl = current - invested;
                      const plPct = invested > 0 ? (pl / invested) * 100 : 0;
                      const dayChange = (live?.change || 0) * h.quantity;
                      const alloc = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;

                      return (
                        <TableRow key={h.id}>
                          <TableCell className="px-4 py-3">
                            <Link to={`/stock/${h.symbol}`} className={stockLinkClass}>
                              {h.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{h.symbol}</div>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right tabular-nums text-foreground/85">{h.quantity}</TableCell>
                          <TableCell className="px-3 py-3 text-right tabular-nums text-foreground/85">
                            {h.buyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right font-medium tabular-nums">
                            {loading ? '...' : currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <div className="flex justify-center">
                              {sparklineData[h.symbol] && sparklineData[h.symbol].length >= 2 ? (
                                <Sparkline data={sparklineData[h.symbol]} />
                              ) : (
                                <Skeleton className="h-[30px] w-[80px] rounded-sm" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                            {formatNumber(invested)}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right font-medium tabular-nums">
                            {loading ? '...' : formatNumber(current)}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right">
                            <div className={cn('font-medium tabular-nums', plColor(pl))}>
                              {loading ? '...' : `${pl >= 0 ? '+' : ''}${formatNumber(pl)}`}
                            </div>
                            {!loading && <PriceChange percent={plPct} className="text-xs" />}
                          </TableCell>
                          <TableCell className={cn('px-3 py-3 text-right text-xs font-medium tabular-nums', plColor(dayChange))}>
                            {loading ? '...' : `${dayChange >= 0 ? '+' : ''}${formatNumber(dayChange)}`}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right text-xs text-muted-foreground">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(alloc, 100)}%` }} />
                              </div>
                              <span className="w-10 tabular-nums">{alloc.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            {!h.isDemo && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleDelete(h.id)}
                                className="text-muted-foreground hover:text-loss"
                                title="Remove holding"
                                aria-label={`Remove ${h.name}`}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </SectionCard>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {sortedHoldings.map((h) => {
                  const live = liveData[h.symbol];
                  const currentPrice = live?.price || h.buyPrice;
                  const invested = h.buyPrice * h.quantity;
                  const current = currentPrice * h.quantity;
                  const pl = current - invested;
                  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
                  const dayChange = (live?.change || 0) * h.quantity;
                  const alloc = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;

                  return (
                    <div key={h.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <Link to={`/stock/${h.symbol}`} className={stockLinkClass}>
                            {h.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{h.symbol}</div>
                        </div>
                        {!h.isDemo && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(h.id)}
                            className="text-muted-foreground hover:text-loss"
                            title="Remove holding"
                            aria-label={`Remove ${h.name}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                      {/* Sparkline */}
                      <div className="mb-3">
                        {sparklineData[h.symbol] && sparklineData[h.symbol].length >= 2 ? (
                          <Sparkline data={sparklineData[h.symbol]} width={120} height={32} />
                        ) : (
                          <Skeleton className="h-[32px] w-[120px] rounded-sm" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Qty</span>
                          <div className="font-medium tabular-nums text-foreground">{h.quantity}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg Buy</span>
                          <div className="font-medium tabular-nums text-foreground">{h.buyPrice.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">CMP</span>
                          <div className="font-medium tabular-nums text-foreground">
                            {loading ? '...' : currentPrice.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Invested</span>
                          <div className="tabular-nums text-foreground/85">{formatNumber(invested)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Current</span>
                          <div className="font-medium tabular-nums text-foreground">{loading ? '...' : formatNumber(current)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Alloc</span>
                          <div className="tabular-nums text-foreground/85">{alloc.toFixed(1)}%</div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(alloc, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div>
                          <span className="mr-1 text-xs text-muted-foreground">P&L:</span>
                          <span className={cn('text-sm font-medium tabular-nums', plColor(pl))}>
                            {loading ? '...' : `${pl >= 0 ? '+' : ''}${formatNumber(pl)} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)`}
                          </span>
                        </div>
                        <div>
                          <span className="mr-1 text-xs text-muted-foreground">Day:</span>
                          <span className={cn('text-xs font-medium tabular-nums', plColor(dayChange))}>
                            {loading ? '...' : `${dayChange >= 0 ? '+' : ''}${formatNumber(dayChange)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== OPTIMIZE PORTFOLIO SECTION ===== */}
      {(() => {
        const uniqueSymbols = [...new Set(displayHoldings.map(h => h.symbol))];
        if (uniqueSymbols.length < 2) return null;
        return (
          <OptimizePortfolio
            symbols={uniqueSymbols}
            totalInvested={totalInvested}
            holdings={displayHoldings}
            liveData={liveData}
            totalCurrent={totalCurrent}
          />
        );
      })()}

      {/* ===== RISK ANALYSIS SECTION ===== */}
      {(() => {
        const uniqueSymbols = [...new Set(displayHoldings.map(h => h.symbol))];
        if (uniqueSymbols.length < 2) return null;
        return <RiskAnalysis symbols={uniqueSymbols} />;
      })()}

      {/* ===== INSIGHTS SECTION (only when portfolio has data and prices loaded) ===== */}
      {displayHoldings.length > 0 && !loading && Object.keys(liveData).length > 0 && (
        <PortfolioInsights holdings={displayHoldings} liveData={liveData} watchlist={watchlist} />
      )}

      <PortfolioImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        market={market}
        holdings={holdings}
        onImport={handleImport}
      />
    </PageContainer>
  );
};

// ===== Risk Analysis Component =====
const RiskAnalysis = ({ symbols }) => {
  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState('');

  const handleAnalyze = async () => {
    setRiskLoading(true);
    setRiskError('');
    setRiskData(null);
    try {
      const res = await api.get('/api/portfolio/risk', {
        params: { symbols: symbols.join(',') },
      });
      setRiskData(res.data);
    } catch (err) {
      setRiskError(err.response?.data?.error || 'Risk analysis failed. Please try again.');
    } finally {
      setRiskLoading(false);
    }
  };

  const getCorrelationColor = (val) => {
    if (val === 1) return 'bg-muted text-muted-foreground';
    if (val >= 0.7) return 'bg-loss/30 text-foreground';
    if (val >= 0.4) return 'bg-loss/15';
    if (val >= 0.1) return 'bg-warning/10';
    if (val >= -0.1) return 'bg-gain/15';
    return 'bg-gain/30';
  };

  const getDiversificationLabel = (ratio) => {
    if (ratio >= 1.5) return { text: 'Well Diversified', color: 'text-gain', bg: 'bg-gain/10' };
    if (ratio >= 1.2) return { text: 'Moderately Diversified', color: 'text-warning', bg: 'bg-warning/10' };
    return { text: 'Low Diversification', color: 'text-loss', bg: 'bg-loss/10' };
  };

  const tile = 'rounded-lg bg-muted/40 p-3';
  const tileLabel = 'text-xs font-medium text-muted-foreground';
  const tileValue = 'text-lg font-bold tabular-nums';
  const shortSym = (sym) => sym.replace('.NS', '').replace('.BO', '');

  return (
    <SectionCard
      title="Risk Analysis"
      description="Portfolio risk metrics using 2 years of historical data"
      action={(
        <Button onClick={handleAnalyze} disabled={riskLoading} size="sm">
          {riskLoading ? 'Analyzing...' : 'Analyze Risk'}
        </Button>
      )}
    >
      {riskError && (
        <div className="mb-4">
          <ErrorState title="Risk analysis failed" message={riskError} />
        </div>
      )}

      {riskLoading && (
        <div className="flex items-center justify-center py-8" role="status">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <span className="ml-3 text-sm text-muted-foreground">Running risk analysis...</span>
        </div>
      )}

      {riskData && !riskLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className={tile}>
              <div className={tileLabel}>Annual Return</div>
              <div className={cn(tileValue, riskData.annual_return_pct >= 0 ? 'text-gain' : 'text-loss')}>
                {riskData.annual_return_pct >= 0 ? '+' : ''}{riskData.annual_return_pct}%
              </div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Volatility</div>
              <div className={cn(tileValue, 'text-warning')}>{riskData.annual_volatility_pct}%</div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Sharpe Ratio</div>
              <div className={cn(tileValue, riskData.sharpe_ratio >= 1 ? 'text-gain' : riskData.sharpe_ratio >= 0 ? 'text-warning' : 'text-loss')}>
                {riskData.sharpe_ratio}
              </div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>VaR (95%)</div>
              <div className={cn(tileValue, 'text-loss')}>{riskData.var_95_daily_pct}%</div>
              <div className="text-[10px] text-muted-foreground">Daily</div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Max Drawdown</div>
              <div className={cn(tileValue, 'text-loss')}>{riskData.max_drawdown_pct}%</div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Beta</div>
              <div className={cn(tileValue, 'text-foreground')}>
                {riskData.beta != null ? riskData.beta : 'N/A'}
              </div>
            </div>
          </div>

          {/* Diversification Ratio */}
          {(() => {
            const d = getDiversificationLabel(riskData.diversification_ratio);
            return (
              <div className={cn(d.bg, 'rounded-lg p-3 mb-6 flex items-center justify-between')}>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Diversification Ratio</span>
                  <div className={cn('text-lg font-bold tabular-nums', d.color)}>
                    {riskData.diversification_ratio}x
                  </div>
                </div>
                <span className={cn('text-sm font-medium px-3 py-1 rounded-full', d.color, d.bg)}>
                  {d.text}
                </span>
              </div>
            );
          })()}

          {/* Risk Contribution */}
          {riskData.risk_contribution && riskData.risk_contribution.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold">Risk Contribution</h3>
              <div className="space-y-2">
                {riskData.risk_contribution.map((rc) => {
                  const maxContrib = Math.max(...riskData.risk_contribution.map(r => Math.abs(r.contribution_pct)));
                  const barWidth = maxContrib > 0 ? (Math.abs(rc.contribution_pct) / maxContrib) * 100 : 0;
                  const isNeg = rc.contribution_pct < 0;
                  return (
                    <div key={rc.symbol} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 truncate text-xs font-medium text-foreground/85">
                        {shortSym(rc.symbol)}
                      </div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full transition-all', isNeg ? 'bg-gain' : 'bg-primary')}
                          style={{ width: `${Math.min(barWidth, 100)}%` }}
                        />
                      </div>
                      <div className={cn('w-16 text-right text-xs font-medium tabular-nums', isNeg ? 'text-gain' : 'text-foreground/85')}>
                        {rc.contribution_pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Shows each stock's marginal contribution to total portfolio variance
              </p>
            </div>
          )}

          {/* Correlation Matrix */}
          {riskData.correlation && Object.keys(riskData.correlation).length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">Correlation Matrix</h3>
              <div className="overflow-x-auto">
                <table className="text-xs border-separate border-spacing-0.5">
                  <thead>
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground"><span className="sr-only">Symbol</span></th>
                      {riskData.symbols.map((sym) => (
                        <th key={sym} className="whitespace-nowrap px-2 py-1.5 text-center font-medium text-muted-foreground">
                          {shortSym(sym)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {riskData.symbols.map((rowSym) => (
                      <tr key={rowSym}>
                        <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-foreground/85">
                          {shortSym(rowSym)}
                        </th>
                        {riskData.symbols.map((colSym) => {
                          const val = riskData.correlation[rowSym]?.[colSym];
                          return (
                            <td
                              key={colSym}
                              className={cn('px-2 py-1.5 text-center font-medium tabular-nums rounded-sm', getCorrelationColor(val ?? 0))}
                            >
                              {val != null ? val.toFixed(2) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="inline-block size-3 rounded-sm bg-gain/30"></span> Low
                <span className="inline-block size-3 rounded-sm border border-warning/30 bg-warning/10"></span> Moderate
                <span className="inline-block size-3 rounded-sm bg-loss/30"></span> High
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs text-foreground/85">
              <strong>Disclaimer:</strong> Risk metrics are based on historical data and may not predict
              future performance. VaR and CVaR are daily figures at 95% confidence. Diversification ratio
              above 1.0 indicates diversification benefit. Always consult a qualified financial advisor.
            </p>
          </div>
        </>
      )}
    </SectionCard>
  );
};

// ===== Optimize Portfolio Component =====
const OptimizePortfolio = ({ symbols, totalInvested, holdings, liveData, totalCurrent }) => {
  const [optResult, setOptResult] = useState(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optError, setOptError] = useState('');

  const handleOptimize = async () => {
    setOptLoading(true);
    setOptError('');
    setOptResult(null);
    try {
      const amount = Math.max(totalInvested, 10000);
      const res = await api.get('/api/portfolio/optimize', {
        params: { symbols: symbols.join(','), amount: Math.round(amount) },
      });
      setOptResult(res.data);
    } catch (err) {
      setOptError(err.response?.data?.error || 'Optimization failed. Please try again.');
    } finally {
      setOptLoading(false);
    }
  };

  // Compute current weights per symbol
  const currentWeights = {};
  holdings.forEach((h) => {
    const price = liveData[h.symbol]?.price || h.buyPrice;
    const val = price * h.quantity;
    currentWeights[h.symbol] = (currentWeights[h.symbol] || 0) + val;
  });
  Object.keys(currentWeights).forEach((sym) => {
    currentWeights[sym] = totalCurrent > 0 ? (currentWeights[sym] / totalCurrent) * 100 : 0;
  });

  const tile = 'rounded-lg bg-muted/40 p-3';
  const tileLabel = 'text-xs font-medium text-muted-foreground';
  const tileValue = 'text-lg font-bold tabular-nums';

  return (
    <SectionCard
      title="Portfolio Optimization"
      description="Mean-Variance optimization (Max Sharpe Ratio) using 2 years of historical data"
      action={(
        <Button onClick={handleOptimize} disabled={optLoading} size="sm">
          {optLoading ? 'Optimizing...' : 'Optimize Portfolio'}
        </Button>
      )}
    >
      {optError && (
        <div className="mb-4">
          <ErrorState title="Optimization failed" message={optError} />
        </div>
      )}

      {optLoading && (
        <div className="flex items-center justify-center py-8" role="status">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <span className="ml-3 text-sm text-muted-foreground">Running optimization...</span>
        </div>
      )}

      {optResult && !optLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className={tile}>
              <div className={tileLabel}>Expected Return</div>
              <div className={cn(tileValue, 'text-foreground')}>{optResult.expected_return}%</div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Volatility</div>
              <div className={cn(tileValue, 'text-warning')}>{optResult.volatility}%</div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Sharpe Ratio</div>
              <div className={cn(tileValue, 'text-gain')}>{optResult.sharpe_ratio}</div>
            </div>
            <div className={tile}>
              <div className={tileLabel}>Leftover Cash</div>
              <div className={cn(tileValue, 'text-foreground/85')}>
                {formatNumber(optResult.leftover_cash)}
              </div>
            </div>
          </div>

          {/* Allocation Table */}
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs uppercase hover:bg-muted/40">
                  <TableHead className="px-4 text-muted-foreground">Stock</TableHead>
                  <TableHead className="px-3 text-right text-muted-foreground">Current Wt%</TableHead>
                  <TableHead className="px-3 text-right text-muted-foreground">Optimal Wt%</TableHead>
                  <TableHead className="px-3 text-right text-muted-foreground">Suggested Shares</TableHead>
                  <TableHead className="px-3 text-right text-muted-foreground">Price</TableHead>
                  <TableHead className="px-4 text-right text-muted-foreground">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {optResult.allocations.map((a) => {
                  const curWt = currentWeights[a.symbol] || 0;
                  const diff = a.weight - curWt;
                  return (
                    <TableRow key={a.symbol}>
                      <TableCell className="px-4 py-3 font-medium">{a.symbol}</TableCell>
                      <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">{curWt.toFixed(1)}%</TableCell>
                      <TableCell className="px-3 py-3 text-right tabular-nums">
                        <span className="font-medium">{a.weight.toFixed(1)}%</span>
                        {Math.abs(diff) > 0.5 && (
                          <span className={cn('ml-1 text-xs', diff > 0 ? 'text-gain' : 'text-loss')}>
                            ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right tabular-nums text-foreground/85">{a.shares}</TableCell>
                      <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">{a.price.toFixed(2)}</TableCell>
                      <TableCell className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatNumber(a.value)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Disclaimer */}
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs text-foreground/85">
              <strong>Disclaimer:</strong> This optimization is for educational purposes only and does not
              constitute financial advice. Past performance does not guarantee future results. The Max Sharpe
              optimization assumes normally distributed returns and may not reflect real-world constraints
              such as taxes, transaction costs, or liquidity. Always consult a qualified financial advisor
              before making investment decisions.
            </p>
          </div>
        </>
      )}
    </SectionCard>
  );
};

// ===== Portfolio Insights Component =====
const PortfolioInsights = ({ holdings, liveData, watchlist }) => {
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [analysts, setAnalysts] = useState({});
  const [loadingAnalysts, setLoadingAnalysts] = useState(true);

  // All unique symbols from portfolio + watchlist
  const portfolioSymbols = [...new Set(holdings.map(h => h.symbol))];
  const symbolsKey = useMemo(() => portfolioSymbols.slice().sort((a, b) => a.localeCompare(b)).join(','), [holdings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch news for portfolio stocks
  useEffect(() => {
    if (portfolioSymbols.length === 0) return;
    const fetchNews = async () => {
      setLoadingNews(true);
      const allArticles = [];
      const seen = new Set();
      // Fetch news for top 5 holdings by value
      const sorted = [...holdings].sort((a, b) => {
        const aVal = (liveData[a.symbol]?.price || a.buyPrice) * a.quantity;
        const bVal = (liveData[b.symbol]?.price || b.buyPrice) * b.quantity;
        return bVal - aVal;
      });
      const topSymbols = sorted.slice(0, 5).map(h => h.symbol);

      await Promise.all(topSymbols.map(async (sym) => {
        try {
          const res = await api.get(`/api/stocks/news/${sym}`);
          (res.data.articles || []).forEach(a => {
            if (!seen.has(a.title)) {
              seen.add(a.title);
              allArticles.push({ ...a, forStock: sym.replace('.NS', '').replace('.BO', '') });
            }
          });
        } catch {}
      }));
      allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      setNews(allArticles.slice(0, 8));
      setLoadingNews(false);
    };
    fetchNews();
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch analyst data for portfolio stocks
  useEffect(() => {
    if (portfolioSymbols.length === 0) return;
    const fetchAnalysts = async () => {
      setLoadingAnalysts(true);
      const data = {};
      await Promise.all(portfolioSymbols.map(async (sym) => {
        try {
          const res = await api.get(`/api/stocks/${sym}/analysts`);
          data[sym] = res.data;
        } catch {}
      }));
      setAnalysts(data);
      setLoadingAnalysts(false);
    };
    fetchAnalysts();
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Price alerts from watchlist
  const alertsTriggered = (watchlist || []).filter(w => {
    const price = liveData[w.symbol]?.price;
    if (!price) return false;
    return (w.alertHigh && price >= w.alertHigh) || (w.alertLow && price <= w.alertLow);
  });

  const alertsNearby = (watchlist || []).filter(w => {
    const price = liveData[w.symbol]?.price;
    if (!price) return false;
    const nearHigh = w.alertHigh && Math.abs((price - w.alertHigh) / w.alertHigh) < 0.03;
    const nearLow = w.alertLow && Math.abs((price - w.alertLow) / w.alertLow) < 0.03;
    return (nearHigh || nearLow) && !alertsTriggered.some(a => a.symbol === w.symbol);
  });

  // Sector performance
  const sectorMap = {};
  holdings.forEach(h => {
    const data = liveData[h.symbol];
    if (!data) return;
    const sector = data.sector || 'Other';
    if (!sectorMap[sector]) sectorMap[sector] = { invested: 0, current: 0, dayChange: 0 };
    sectorMap[sector].invested += h.buyPrice * h.quantity;
    sectorMap[sector].current += (data.price || h.buyPrice) * h.quantity;
    sectorMap[sector].dayChange += (data.change || 0) * h.quantity;
  });

  const sectors = Object.entries(sectorMap).map(([name, data]) => ({
    name,
    invested: data.invested,
    current: data.current,
    pl: data.current - data.invested,
    plPct: ((data.current - data.invested) / data.invested) * 100,
    dayChange: data.dayChange,
    allocation: 0,
  }));
  const totalCurrent = sectors.reduce((sum, s) => sum + s.current, 0);
  sectors.forEach(s => { s.allocation = totalCurrent > 0 ? (s.current / totalCurrent) * 100 : 0; });
  sectors.sort((a, b) => b.current - a.current);

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

  const recVariants = {
    strong_buy: 'gain',
    buy: 'gain',
    hold: 'warning',
    sell: 'loss',
    underperform: 'loss',
    strong_sell: 'loss',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight">Portfolio Insights</h2>

      {/* Price Alert Triggers */}
      {(alertsTriggered.length > 0 || alertsNearby.length > 0) && (
        <div className="space-y-3">
          {alertsTriggered.length > 0 && (
            <SectionCard
              className="border-loss/30 bg-loss/5"
              title={(
                <span className="flex items-center gap-2 text-loss">
                  <AlertTriangle className="size-4" aria-hidden />
                  Price Alerts Triggered
                </span>
              )}
            >
              <div className="space-y-2">
                {alertsTriggered.map(w => {
                  const price = liveData[w.symbol]?.price;
                  const hitHigh = w.alertHigh && price >= w.alertHigh;
                  const hitLow = w.alertLow && price <= w.alertLow;
                  return (
                    <Link key={w.symbol} to={`/stock/${w.symbol}`}
                      className="flex items-center justify-between rounded-lg bg-card p-2 transition-colors hover:bg-muted/50">
                      <div>
                        <span className="text-sm font-semibold text-foreground">{w.name || w.symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{w.symbol.replace('.NS', '')}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold tabular-nums">₹{price?.toFixed(2)}</div>
                        <div className="text-xs text-loss">
                          {hitHigh && `Crossed target ₹${w.alertHigh}`}
                          {hitLow && `Fell below ₹${w.alertLow}`}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {alertsNearby.length > 0 && (
            <SectionCard className="border-warning/30 bg-warning/5" title="Approaching Alert Targets">
              <div className="space-y-2">
                {alertsNearby.map(w => {
                  const price = liveData[w.symbol]?.price;
                  const nearHigh = w.alertHigh && Math.abs(price - w.alertHigh);
                  const nearLow = w.alertLow && Math.abs(price - w.alertLow);
                  return (
                    <Link key={w.symbol} to={`/stock/${w.symbol}`}
                      className="flex items-center justify-between rounded-lg bg-card p-2 transition-colors hover:bg-muted/50">
                      <span className="text-sm font-medium text-foreground">{w.name || w.symbol}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ₹{price?.toFixed(2)} — {nearHigh < nearLow ? `₹${nearHigh?.toFixed(2)} from ₹${w.alertHigh} target` : `₹${nearLow?.toFixed(2)} from ₹${w.alertLow} floor`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Sector Performance */}
      {sectors.length > 0 && (
        <SectionCard title="Your Sector Performance">
          <div className="space-y-3">
            {sectors.map(s => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-28 truncate text-sm font-medium text-foreground/85">{s.name}</div>
                <div className="flex-1">
                  <div className="flex h-5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', s.pl >= 0 ? 'bg-gain' : 'bg-loss')}
                      style={{ width: `${Math.min(s.allocation, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="w-16 text-right text-xs tabular-nums text-muted-foreground">{s.allocation.toFixed(1)}%</div>
                <div className={cn('w-20 text-right text-xs font-semibold tabular-nums', s.pl >= 0 ? 'text-gain' : 'text-loss')}>
                  {s.plPct >= 0 ? '+' : ''}{s.plPct.toFixed(1)}%
                </div>
                <div className={cn('w-24 text-right text-xs tabular-nums', s.dayChange >= 0 ? 'text-gain' : 'text-loss')}>
                  Today: {s.dayChange >= 0 ? '+' : ''}₹{Math.abs(s.dayChange).toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Analyst Recommendations */}
      {!loadingAnalysts && Object.keys(analysts).length > 0 && (
        <SectionCard title="Analyst Recommendations for Your Holdings">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {portfolioSymbols.map(sym => {
              const data = analysts[sym];
              if (!data) return null;
              const name = holdings.find(h => h.symbol === sym)?.name || sym;
              const price = liveData[sym]?.price;
              const targetDiff = data.target_mean_price && price
                ? ((data.target_mean_price - price) / price * 100).toFixed(1) : null;
              return (
                <Link key={sym} to={`/stock/${sym}`}
                  className="block rounded-lg border border-border bg-muted/40 p-3 transition-colors hover:border-foreground/20">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{name}</div>
                      <div className="text-[10px] text-muted-foreground">{sym.replace('.NS', '')}</div>
                    </div>
                    {data.recommendation && (
                      <Badge
                        variant={recVariants[data.recommendation] || 'secondary'}
                        className="rounded-sm text-[10px] font-bold uppercase"
                      >
                        {data.recommendation.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                  {data.target_mean_price && (
                    <div className="flex justify-between text-xs">
                      <span className="tabular-nums text-muted-foreground">Target: ₹{data.target_mean_price.toFixed(0)}</span>
                      {targetDiff && (
                        <span className={cn('font-medium tabular-nums', parseFloat(targetDiff) >= 0 ? 'text-gain' : 'text-loss')}>
                          {parseFloat(targetDiff) >= 0 ? '+' : ''}{targetDiff}% upside
                        </span>
                      )}
                    </div>
                  )}
                  {data.number_of_analysts && (
                    <div className="mt-1 text-[10px] text-muted-foreground">{data.number_of_analysts} analysts</div>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-2">
            <p className="text-[10px] text-foreground/85">Analyst ratings are for informational purposes only and do not constitute financial advice.</p>
          </div>
        </SectionCard>
      )}

      {/* Portfolio Stock News */}
      {!loadingNews && news.length > 0 && (
        <SectionCard
          title="News for Your Stocks"
          action={(
            <Link to="/news" className="text-xs font-medium text-foreground underline-offset-4 hover:underline dark:text-primary">
              All news
            </Link>
          )}
        >
          <div className="space-y-1">
            {news.map((article, idx) => (
              <a key={idx} href={article.url} target="_blank" rel="noopener noreferrer"
                className="group flex gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
                {article.image ? (
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    <img src={article.image} alt="" className="h-full w-full rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Newspaper className="size-5 text-muted-foreground/60" aria-hidden />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-foreground dark:group-hover:text-primary">{article.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px]">{article.forStock}</Badge>
                    <span className="text-[10px] text-muted-foreground">{article.source} · {formatDate(article.published_at)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default PortfolioPage;
