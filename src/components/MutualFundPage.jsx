import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import api from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import PriceChange from '@/components/common/PriceChange';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { useChartTheme } from '@/hooks/useChartTheme';
import { withAlpha } from '@/lib/color';
import { cn } from '@/lib/utils';

const CATEGORIES = ['All', 'Equity Large Cap', 'Equity Mid Cap', 'Equity Small Cap', 'ELSS', 'Debt', 'Hybrid', 'Index'];

const PERIODS = [
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: 'max', label: 'Max' },
];

const TH_CLASS = 'px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const DROPDOWN_CLASS = 'absolute z-40 top-full left-0 right-0 mt-1 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg';
const DROPDOWN_ITEM_CLASS = 'w-full text-left border-b border-border last:border-0 transition-colors hover:bg-muted';

function NavChart({ schemeCode, period }) {
  const canvasRef = useRef(null);
  const ct = useChartTheme();
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schemeCode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/api/mf/${schemeCode}/history?period=${period}`)
      .then(res => {
        if (!cancelled) {
          const data = (res.data.data || [])
            .filter(d => d.nav != null)
            ; // data is already oldest-first from backend
          setChartData(data);
        }
      })
      .catch(() => { if (!cancelled) setError('Failed to load NAV history'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schemeCode, period]);

  useEffect(() => {
    if (!chartData || chartData.length < 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const navs = chartData.map(d => d.nav);
    const minN = Math.min(...navs) * 0.995;
    const maxN = Math.max(...navs) * 1.005;
    const range = maxN - minN || 1;

    const pad = { top: 20, right: 20, bottom: 30, left: 70 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = ct.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const val = maxN - (range / 4) * i;
      ctx.fillStyle = ct.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), pad.left - 5, y + 3);
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    const isUp = navs[navs.length - 1] >= navs[0];
    const trendColor = isUp ? ct.gain : ct.loss;
    gradient.addColorStop(0, withAlpha(trendColor, 0.15));
    gradient.addColorStop(1, withAlpha(trendColor, 0));

    const gap = cW / (navs.length - 1);

    ctx.beginPath();
    navs.forEach((n, i) => {
      const x = pad.left + gap * i;
      const y = pad.top + ((maxN - n) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + gap * (navs.length - 1), pad.top + cH);
    ctx.lineTo(pad.left, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    navs.forEach((n, i) => {
      const x = pad.left + gap * i;
      const y = pad.top + ((maxN - n) / range) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // X-axis labels
    ctx.fillStyle = ct.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(chartData.length / 6));
    for (let i = 0; i < chartData.length; i += step) {
      const x = pad.left + gap * i;
      ctx.fillText(chartData[i].date, x, H - 8);
    }
  }, [chartData, ct]);

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (error) return <ErrorState title={error} />;
  if (!chartData || chartData.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">No history data available</p>;

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-border bg-card"
      style={{ height: '320px' }}
    />
  );
}

function MFOverlapTool() {
  const [query1, setQuery1] = useState('');
  const [query2, setQuery2] = useState('');
  const [results1, setResults1] = useState([]);
  const [results2, setResults2] = useState([]);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [fund1, setFund1] = useState(null);
  const [fund2, setFund2] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [loading, setLoading] = useState(false);
  const db1 = useRef(null);
  const db2 = useRef(null);

  const searchFunds = (query, setResults, setShow) => {
    if (query.trim().length < 2) { setResults([]); setShow(false); return; }
    const ref = setResults === setResults1 ? db1 : db2;
    clearTimeout(ref.current);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/mf/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.results || []);
        setShow(true);
      } catch { setResults([]); }
    }, 400);
    ref.current = timer;
  };

  const checkOverlap = async () => {
    if (!fund1 || !fund2) return;
    setLoading(true);
    setOverlap(null);
    try {
      const res = await api.get(`/api/mf/overlap?codes=${fund1.scheme_code},${fund2.scheme_code}`);
      setOverlap(res.data);
    } catch {
      setOverlap(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Portfolio Overlap Checker"
        description="Compare stock holdings between two mutual funds"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          {/* Fund 1 */}
          <div className="relative">
            <label htmlFor="mf-overlap-a" className="block text-xs font-medium text-muted-foreground mb-1">Fund A</label>
            <Input
              id="mf-overlap-a"
              type="text"
              value={query1}
              onChange={e => { setQuery1(e.target.value); setFund1(null); searchFunds(e.target.value, setResults1, setShow1); }}
              placeholder="Search fund..."
              autoComplete="off"
            />
            {fund1 && <div className="text-xs font-medium text-foreground/85 mt-1 truncate">{fund1.scheme_name}</div>}
            {show1 && results1.length > 0 && (
              <div className={cn(DROPDOWN_CLASS, 'max-h-48')}>
                {results1.map(r => (
                  <button key={r.scheme_code} type="button"
                    onClick={() => { setFund1(r); setQuery1(r.scheme_name); setShow1(false); }}
                    className={cn(DROPDOWN_ITEM_CLASS, 'px-3 py-2 text-xs')}
                  >{r.scheme_name}</button>
                ))}
              </div>
            )}
          </div>

          {/* Fund 2 */}
          <div className="relative">
            <label htmlFor="mf-overlap-b" className="block text-xs font-medium text-muted-foreground mb-1">Fund B</label>
            <Input
              id="mf-overlap-b"
              type="text"
              value={query2}
              onChange={e => { setQuery2(e.target.value); setFund2(null); searchFunds(e.target.value, setResults2, setShow2); }}
              placeholder="Search fund..."
              autoComplete="off"
            />
            {fund2 && <div className="text-xs font-medium text-foreground/85 mt-1 truncate">{fund2.scheme_name}</div>}
            {show2 && results2.length > 0 && (
              <div className={cn(DROPDOWN_CLASS, 'max-h-48')}>
                {results2.map(r => (
                  <button key={r.scheme_code} type="button"
                    onClick={() => { setFund2(r); setQuery2(r.scheme_name); setShow2(false); }}
                    className={cn(DROPDOWN_ITEM_CLASS, 'px-3 py-2 text-xs')}
                  >{r.scheme_name}</button>
                ))}
              </div>
            )}
          </div>

          <Button
            type="button"
            onClick={checkOverlap}
            disabled={!fund1 || !fund2 || loading}
          >
            {loading ? 'Analyzing...' : 'Check Overlap'}
          </Button>
        </div>
      </SectionCard>

      {/* Results */}
      {overlap && (
        <SectionCard title="Overlap Results" contentClassName="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Portfolio Overlap" value={`${overlap.overlap_pct?.toFixed(1)}%`} className="bg-muted/40" />
            <StatCard label="Common Stocks" value={overlap.common_count} className="bg-muted/40" />
            <StatCard label="Shown Below" value={overlap.holdings?.length || 0} className="bg-muted/40" />
          </div>

          {/* Common Holdings Table */}
          {overlap.holdings?.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className={TH_CLASS}>Stock</TableHead>
                    <TableHead className={cn(TH_CLASS, 'text-right')}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                        Fund A Weight
                      </span>
                    </TableHead>
                    <TableHead className={cn(TH_CLASS, 'text-center')}>Overlap</TableHead>
                    <TableHead className={cn(TH_CLASS, 'text-right')}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-chart-2" aria-hidden />
                        Fund B Weight
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overlap.holdings.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-3 font-medium">{h.name}</TableCell>
                      <TableCell className="px-3 text-right tabular-nums text-foreground/85">{h.weight1?.toFixed(2)}%</TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-center justify-center gap-1">
                          <div className="h-2 bg-chart-1 rounded-l" style={{ width: `${Math.min(h.weight1 * 8, 40)}px` }} />
                          <div className="h-2 bg-chart-2 rounded-r" style={{ width: `${Math.min(h.weight2 * 8, 40)}px` }} />
                        </div>
                      </TableCell>
                      <TableCell className="px-3 text-right tabular-nums text-foreground/85">{h.weight2?.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function MutualFundPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [topFunds, setTopFunds] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedFund, setSelectedFund] = useState(null);
  const [navPeriod, setNavPeriod] = useState('1y');
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'overlap'
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  // Fetch top funds
  useEffect(() => {
    setLoadingTop(true);
    const cat = activeCategory === 'All' ? 'all' : activeCategory;
    api.get(`/api/mf/top?category=${encodeURIComponent(cat)}`)
      .then(res => setTopFunds(res.data.funds || []))
      .catch(() => setTopFunds([]))
      .finally(() => setLoadingTop(false));
  }, [activeCategory]);

  // Search autocomplete
  useEffect(() => {
    if (selectedFund) return; // Skip search when fund is already selected
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/mf/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(res.data.results || []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, selectedFund]);

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

  const selectFund = (fund) => {
    setSelectedFund(fund);
    setSearchQuery(fund.scheme_name);
    setShowDropdown(false);
    setSearchResults([]);
    setNavPeriod('1y');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Mutual Funds"
        description="Search, analyze and compare Indian mutual funds"
        actions={
          <Button
            type="button"
            variant={activeTab === 'overlap' ? 'default' : 'secondary'}
            aria-pressed={activeTab === 'overlap'}
            onClick={() => { setActiveTab(activeTab === 'overlap' ? 'browse' : 'overlap'); setSelectedFund(null); }}
          >
            {activeTab === 'overlap' ? 'Back to Funds' : 'Portfolio Overlap'}
          </Button>
        }
      />

      {/* Overlap Tool */}
      {activeTab === 'overlap' && <MFOverlapTool />}

      {/* Browse mode: search + funds */}
      {activeTab === 'browse' && (<>
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSelectedFund(null); }}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder="Search mutual funds (e.g., HDFC Mid Cap, SBI Small Cap)"
            aria-label="Search mutual funds"
            autoComplete="off"
            className="h-11 bg-card pl-9"
          />
        </div>
        {showDropdown && searchResults.length > 0 && (
          <div className={cn(DROPDOWN_CLASS, 'max-h-72')}>
            {searchResults.map((r) => (
              <button
                key={r.scheme_code}
                type="button"
                onClick={() => selectFund(r)}
                className={cn(DROPDOWN_ITEM_CLASS, 'px-4 py-2.5')}
              >
                <div className="text-sm">{r.scheme_name}</div>
                <div className="text-xs text-muted-foreground tabular-nums">Code: {r.scheme_code}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Fund Detail */}
      {selectedFund && (
        <FundDetail
          schemeCode={selectedFund.scheme_code}
          schemeName={selectedFund.scheme_name}
          period={navPeriod}
          setPeriod={setNavPeriod}
          onBack={() => { setSelectedFund(null); setSearchQuery(''); }}
        />
      )}

      {/* Category Filter */}
      {!selectedFund && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Fund category">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                aria-pressed={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                  activeCategory === cat
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Top Funds Grid */}
          {loadingTop ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : topFunds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topFunds.map(fund => (
                <button
                  key={fund.scheme_code}
                  type="button"
                  onClick={() => selectFund(fund)}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20"
                >
                  <div className="text-xs font-medium text-muted-foreground mb-1">{fund.category}</div>
                  <div className="text-sm font-semibold line-clamp-2 mb-2">{fund.scheme_name}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums">
                      {fund.nav != null ? `₹${fund.nav.toFixed(2)}` : 'N/A'}
                    </span>
                    <span className="text-xs text-muted-foreground">NAV</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No funds found for this category" />
          )}
        </div>
      )}
      </>)}

      {/* Disclaimer */}
      <p className="pt-2 text-xs text-muted-foreground text-center">
        Data sourced from AMFI via mftool. NAV values may be delayed by 1 business day. Not financial advice.
        {' '}Mutual fund investments are subject to market risks.
      </p>
    </PageContainer>
  );
}

function FundDetail({ schemeCode, schemeName, period, setPeriod, onBack }) {
  const [nav, setNav] = useState(null);
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(true);

  useEffect(() => {
    setLoading(true);
    setLoadingHoldings(true);
    api.get(`/api/mf/${schemeCode}/nav`)
      .then(res => setNav(res.data))
      .catch(() => setNav(null))
      .finally(() => setLoading(false));
    api.get(`/api/mf/${schemeCode}/holdings`)
      .then(res => setHoldings(res.data))
      .catch(() => setHoldings(null))
      .finally(() => setLoadingHoldings(false));
  }, [schemeCode]);

  const formatCr = (val) => {
    if (!val) return '-';
    if (val >= 1e9) return `₹${(val / 1e10).toFixed(0)} Cr`;
    if (val >= 1e7) return `₹${(val / 1e7).toFixed(1)} Cr`;
    return `₹${(val / 1e5).toFixed(1)} L`;
  };

  return (
    <div className="space-y-4">
      {/* Fund Header */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold">{schemeName}</h2>
            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">Scheme Code: {schemeCode}</div>
            {!loading && nav && (
              <div className="flex flex-wrap gap-2 mt-3">
                {nav.category && <Badge variant="secondary">{nav.category}</Badge>}
                {nav.risk_label && <Badge variant="warning">{nav.risk_label}</Badge>}
                {nav.expense_ratio != null && <Badge variant="outline" className="tabular-nums">Expense: {nav.expense_ratio}%</Badge>}
                {nav.aum && <Badge variant="outline" className="tabular-nums">AUM: {formatCr(nav.aum)}</Badge>}
              </div>
            )}
          </div>
          {!loading && nav && (
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">₹{nav.nav?.toFixed(4)}</div>
              <div className="text-xs text-muted-foreground">NAV as of {nav.nav_date}</div>
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-end">
              <Skeleton className="h-7 w-24 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          )}
        </div>

        {/* Returns */}
        {!loading && nav?.returns && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 pt-4 border-t border-border">
            {[
              { label: '1M', val: nav.returns.return_1m },
              { label: '3M', val: nav.returns.return_3m },
              { label: '6M', val: nav.returns.return_6m },
              { label: '1Y', val: nav.returns.return_1y },
              { label: '3Y', val: nav.returns.return_3y },
              { label: '5Y', val: nav.returns.return_5y },
            ].map(r => (
              <div key={r.label} className="text-center">
                <div className="text-[10px] text-muted-foreground">{r.label}</div>
                <PriceChange percent={r.val} decimals={1} className="text-sm font-bold" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Period Selector + Chart */}
      <SectionCard
        title="NAV History"
        action={
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="NAV period">
            {PERIODS.map(p => (
              <button
                key={p.value}
                type="button"
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  period === p.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      >
        <NavChart schemeCode={schemeCode} period={period} />
      </SectionCard>

      {/* Holdings */}
      <SectionCard
        title="Top Holdings"
        action={holdings?.month && <span className="text-xs text-muted-foreground">As of {holdings.month}</span>}
      >
        {loadingHoldings ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-3/4" />)}
          </div>
        ) : holdings?.holdings?.length > 0 ? (
          <>
            {/* Allocation summary */}
            <div className="flex gap-3 mb-4">
              {holdings.equity_pct != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-chart-1" />
                  <span className="text-xs text-muted-foreground tabular-nums">Equity {holdings.equity_pct}%</span>
                </div>
              )}
              {holdings.debt_pct != null && holdings.debt_pct > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-chart-2" />
                  <span className="text-xs text-muted-foreground tabular-nums">Debt {holdings.debt_pct}%</span>
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className={TH_CLASS}>#</TableHead>
                    <TableHead className={TH_CLASS}>Stock</TableHead>
                    <TableHead className={TH_CLASS}>Sector</TableHead>
                    <TableHead className={cn(TH_CLASS, 'text-right')}>Weight</TableHead>
                    <TableHead className={cn(TH_CLASS, 'text-right')}>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.holdings.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-3 text-xs text-muted-foreground/70 tabular-nums">{i + 1}</TableCell>
                      <TableCell className="px-3 font-medium">{h.name}</TableCell>
                      <TableCell className="px-3 text-xs text-muted-foreground">{h.sector || '-'}</TableCell>
                      <TableCell className="px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-chart-1 rounded-full" style={{ width: `${Math.min((h.weight || 0) * 10, 100)}%` }} />
                          </div>
                          <span className="font-medium tabular-nums text-foreground/85">{h.weight?.toFixed(2)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 text-right text-xs text-muted-foreground tabular-nums">{formatCr(h.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-4">Holdings data not available for this fund</p>
        )}
      </SectionCard>

      {/* Back button */}
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft aria-hidden />
        Back to all funds
      </Button>
    </div>
  );
}

export default MutualFundPage;
