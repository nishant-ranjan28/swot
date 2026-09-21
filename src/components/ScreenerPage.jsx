import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useMarket } from '../context/MarketContext';
import { exportToCSV } from '../utils/exportUtils';
import { ChevronDown, Download, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import SortableTableHead from '@/components/common/SortableTableHead';
import PriceChange from '@/components/common/PriceChange';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';
import { selectClass } from '@/lib/select';
import { segmentClass } from '@/lib/segment';

const formatNumber = (num) => {
  if (num == null) return 'N/A';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const formatVal = (val, suffix = '') => {
  if (val == null) return '-';
  return `${typeof val === 'number' ? val.toFixed(2) : val}${suffix}`;
};

const FILTER_GROUPS = [
  {
    label: 'Valuation',
    filters: [
      { key: 'market_cap_range', label: 'Market Cap', options: [
        { label: 'All', value: 'all' },
        { label: 'Large Cap (>1L Cr)', value: 'large' },
        { label: 'Mid Cap (25K-1L Cr)', value: 'mid' },
        { label: 'Small Cap (<25K Cr)', value: 'small' },
      ]},
      { key: 'pe_range', label: 'P/E Ratio', options: [
        { label: 'All', value: 'all' },
        { label: '< 10 (Deep Value)', value: '<10' },
        { label: '10 - 20', value: '10-20' },
        { label: '20 - 40', value: '20-40' },
        { label: '> 40 (Growth)', value: '>40' },
      ]},
      { key: 'pb_range', label: 'P/B Ratio', options: [
        { label: 'All', value: 'all' },
        { label: '< 1 (Below Book)', value: '<1' },
        { label: '1 - 3', value: '1-3' },
        { label: '3 - 5', value: '3-5' },
        { label: '> 5', value: '>5' },
      ]},
      { key: 'peg_range', label: 'PEG Ratio', options: [
        { label: 'All', value: 'all' },
        { label: '< 1 (Undervalued)', value: '<1' },
        { label: '1 - 2', value: '1-2' },
        { label: '> 2 (Overvalued)', value: '>2' },
      ]},
      { key: 'ev_ebitda_range', label: 'EV/EBITDA', options: [
        { label: 'All', value: 'all' },
        { label: '< 10', value: '<10' },
        { label: '10 - 20', value: '10-20' },
        { label: '> 20', value: '>20' },
      ]},
    ],
  },
  {
    label: 'Profitability',
    filters: [
      { key: 'roe_range', label: 'ROE %', options: [
        { label: 'All', value: 'all' },
        { label: '> 20% (Excellent)', value: '>20' },
        { label: '> 15%', value: '>15' },
        { label: '> 10%', value: '>10' },
        { label: '< 0% (Loss)', value: '<0' },
      ]},
      { key: 'profit_margin_range', label: 'Profit Margin', options: [
        { label: 'All', value: 'all' },
        { label: '> 20% (High)', value: '>20' },
        { label: '> 10%', value: '>10' },
        { label: '> 0%', value: '>0' },
        { label: '< 0% (Loss)', value: '<0' },
      ]},
    ],
  },
  {
    label: 'Growth',
    filters: [
      { key: 'rev_growth_range', label: 'Revenue Growth', options: [
        { label: 'All', value: 'all' },
        { label: '> 20% (High)', value: '>20' },
        { label: '> 10%', value: '>10' },
        { label: '> 0%', value: '>0' },
        { label: '< 0% (Declining)', value: '<0' },
      ]},
    ],
  },
  {
    label: 'Dividends',
    filters: [
      { key: 'div_yield_range', label: 'Dividend Yield', options: [
        { label: 'All', value: 'all' },
        { label: '> 5% (High)', value: '>5' },
        { label: '> 3%', value: '>3' },
        { label: '> 1%', value: '>1' },
        { label: 'No Dividend', value: '0' },
      ]},
    ],
  },
  {
    label: 'Analyst',
    filters: [
      { key: 'recommendation_range', label: 'Recommendation', options: [
        { label: 'All', value: 'all' },
        { label: 'Strong Buy', value: 'strong_buy' },
        { label: 'Buy', value: 'buy' },
        { label: 'Hold', value: 'hold' },
        { label: 'Sell / Underperform', value: 'sell' },
      ]},
    ],
  },
];

const COLUMNS = [
  { key: 'name', label: 'Company', sticky: true },
  { key: 'sector', label: 'Sector' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'change_percent', label: 'Chg%', align: 'right' },
  { key: 'market_cap', label: 'MCap', align: 'right' },
  { key: 'pe_ratio', label: 'P/E', align: 'right' },
  { key: 'pb_ratio', label: 'P/B', align: 'right' },
  { key: 'dividend_yield', label: 'Div%', align: 'right' },
  { key: 'eps', label: 'EPS', align: 'right' },
  { key: 'book_value', label: 'BV', align: 'right' },
  { key: 'week52_high', label: '52W H', align: 'right' },
  { key: 'week52_low', label: '52W L', align: 'right' },
  { key: 'volume', label: 'Volume', align: 'right' },
  { key: 'recommendation', label: 'Rating', align: 'center' },
];

// Same rating -> tone mapping as before, expressed as Badge variants.
const RATING_BADGE = {
  buy: { variant: 'gain' },
  strong_buy: { variant: 'gain', className: 'bg-gain/25' },
  hold: { variant: 'warning' },
  sell: { variant: 'loss' },
  underperform: { variant: 'loss' },
  strong_sell: { variant: 'loss', className: 'bg-loss/25' },
};

const RatingBadge = ({ rating }) => {
  if (!rating) return <span className="text-muted-foreground">-</span>;
  const style = RATING_BADGE[rating] || { variant: 'secondary' };
  return (
    <Badge variant={style.variant} className={cn('rounded-sm px-1.5 text-[10px] font-semibold uppercase', style.className)}>
      {rating.replace('_', ' ')}
    </Badge>
  );
};

const alignClass = (col) => (col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left');

const ScreenerPage = () => {
  const { market, marketLabel } = useMarket();
  const [stocks, setStocks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});
  const [sortKey, setSortKey] = useState('market_cap');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedGroups, setExpandedGroups] = useState({ Valuation: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [resultSize, setResultSize] = useState(50);
  const [filterLogic, setFilterLogic] = useState('AND');

  const fetchStocks = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('size', resultSize);
    params.set('sort', sortKey === 'market_cap' ? 'intradaymarketcap' : sortKey);
    params.set('sort_dir', sortDir);
    params.set('logic', filterLogic);
    params.set('market', market);

    // Add active filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
      }
    });

    api.get(`/api/stocks/screener?${params.toString()}`)
      .then((res) => {
        setStocks(res.data.stocks || []);
        setTotal(res.data.total || 0);
      })
      .catch(() => setError('Failed to load screener data'))
      .finally(() => setLoading(false));
  }, [filters, resultSize, sortKey, sortDir, filterLogic, market]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleGroup = (label) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const activeFilterCount = Object.values(filters).filter((v) => v && v !== 'all').length;

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  // Local text search on loaded results
  const displayedStocks = useMemo(() => {
    if (!searchTerm) return stocks;
    const term = searchTerm.toLowerCase();
    return stocks.filter(s =>
      s.name?.toLowerCase().includes(term) || s.symbol?.toLowerCase().includes(term)
    );
  }, [stocks, searchTerm]);

  // Local sort
  const sortedStocks = useMemo(() => {
    return [...displayedStocks].sort((a, b) => {
      let aVal = a[sortKey]; let bVal = b[sortKey];
      if (aVal == null) return 1; if (bVal == null) return -1;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [displayedStocks, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const renderCell = (stock, col) => {
    const val = stock[col.key];
    switch (col.key) {
      case 'name':
        return (
          <Link to={`/stock/${stock.symbol}`} className="underline-offset-4 hover:underline">
            <div className="text-sm font-semibold text-foreground">{stock.name}</div>
            <div className="text-[10px] text-muted-foreground">{stock.symbol}</div>
          </Link>
        );
      case 'price': return val != null ? <span className="font-medium">₹{val.toFixed(2)}</span> : <span>-</span>;
      case 'change_percent':
        return <PriceChange percent={val} className="font-semibold" />;
      case 'market_cap': return formatNumber(val);
      case 'volume': return formatNumber(val);
      case 'week52_high': case 'week52_low': return val ? `₹${val.toFixed(2)}` : '-';
      case 'recommendation': return <RatingBadge rating={val} />;
      default: return formatVal(val, col.key.includes('yield') ? '%' : '');
    }
  };

  return (
    <PageContainer className="max-w-[1400px] space-y-4">
      <PageHeader
        title="Stock Screener"
        description={`Search across ${total.toLocaleString('en-IN')}+ ${marketLabel} stocks with real-time filters`}
        actions={
          <>
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Results to show">
              {[50, 100, 200].map((n) => (
                <button key={n} type="button" aria-pressed={resultSize === n}
                  onClick={() => setResultSize(n)} className={segmentClass(resultSize === n)}>
                  Show {n}
                </button>
              ))}
            </div>
            {sortedStocks.length > 0 && !loading && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const csvColumns = COLUMNS.map(col => ({
                    label: col.label,
                    key: row => {
                      const val = row[col.key];
                      if (col.key === 'name') return `${row.name} (${row.symbol})`;
                      if (col.key === 'market_cap' || col.key === 'volume') return val != null ? val : '';
                      if (col.key === 'recommendation') return val || '';
                      return val != null ? val : '';
                    }
                  }));
                  exportToCSV(sortedStocks, csvColumns, `screener_${new Date().toISOString().split('T')[0]}`);
                }}
                title="Export results to CSV"
              >
                <Download aria-hidden />
                Export CSV
              </Button>
            )}
          </>
        }
      />

      {/* Search + filters */}
      <SectionCard title="Filters" contentClassName="p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input type="text" placeholder="Search in results by name or symbol..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-card"
          />
          {/* AND/OR toggle */}
          {activeFilterCount >= 2 && (
            <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Filter logic">
              <button type="button" aria-pressed={filterLogic === 'AND'} onClick={() => setFilterLogic('AND')}
                className={segmentClass(filterLogic === 'AND')}>AND</button>
              <button type="button" aria-pressed={filterLogic === 'OR'} onClick={() => setFilterLogic('OR')}
                className={segmentClass(filterLogic === 'OR')}>OR</button>
            </div>
          )}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-loss hover:text-loss">
              Clear all ({activeFilterCount})
            </Button>
          )}
        </div>

        {/* Filter Groups */}
        {FILTER_GROUPS.map((group) => (
          <div key={group.label} className="border-t border-border">
            <button type="button" onClick={() => toggleGroup(group.label)}
              aria-expanded={!!expandedGroups[group.label]}
              className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{group.label}</span>
                {group.filters.some((f) => filters[f.key] && filters[f.key] !== 'all') && (
                  <span className="size-2 rounded-full bg-primary" aria-hidden></span>
                )}
              </div>
              <ChevronDown aria-hidden
                className={cn('size-4 text-muted-foreground/70 transition-transform', expandedGroups[group.label] && 'rotate-180')} />
            </button>
            {expandedGroups[group.label] && (
              <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {group.filters.map((filter) => (
                  <div key={filter.key}>
                    <label htmlFor={`screener-${filter.key}`}
                      className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{filter.label}</label>
                    <select id={`screener-${filter.key}`}
                      value={filters[filter.key] || 'all'} onChange={(e) => setFilter(filter.key, e.target.value)}
                      className={cn(selectClass, 'w-full',
                        filters[filter.key] && filters[filter.key] !== 'all' && 'border-primary ring-1 ring-primary/30')}>
                      {filter.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </SectionCard>

      {/* Results info */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground tabular-nums">
          {loading ? 'Searching...' : `${sortedStocks.length} stocks shown (${total.toLocaleString('en-IN')} matched)`}
        </span>
        <span className="text-[10px] text-muted-foreground">Click column headers to sort</span>
      </div>

      {/* Table */}
      {error ? (
        <ErrorState message={error} onRetry={fetchStocks} />
      ) : loading ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((col) => (
                  <SortableTableHead
                    key={col.key}
                    active={sortKey === col.key}
                    dir={sortDir}
                    onSort={() => handleSort(col.key)}
                    align={col.align === 'right' ? 'right' : 'left'}
                    className={cn(
                      'px-3 font-semibold text-muted-foreground',
                      col.align === 'center' && 'text-center',
                      col.sticky && 'sticky left-0 z-10 bg-card',
                    )}
                  >
                    {col.label}
                  </SortableTableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStocks.map((stock) => (
                <TableRow key={stock.symbol}>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key}
                      className={cn('px-3 py-2', alignClass(col), col.sticky && 'sticky left-0 z-10 bg-card')}>
                      {renderCell(stock, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {sortedStocks.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS.length} className="whitespace-normal p-4">
                    <EmptyState icon={SearchX} title="No stocks match your filters." className="border-0 py-8" />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
};

export default ScreenerPage;
