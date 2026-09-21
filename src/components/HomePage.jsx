import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import StockSearch from './StockSearch';
import { useMarket } from '../context/MarketContext';
import { Newspaper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import StatCard from '@/components/common/StatCard';
import PriceChange from '@/components/common/PriceChange';
import { cn } from '@/lib/utils';

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

const MARKET_CONFIG = {
  in: { timezone: 'Asia/Kolkata', label: 'IST', openH: 9, openM: 15, closeH: 15, closeM: 30 },
  us: { timezone: 'America/New_York', label: 'ET', openH: 9, openM: 30, closeH: 16, closeM: 0 },
};

const MarketStatus = () => {
  const { market } = useMarket();
  const [status, setStatus] = useState({ isOpen: false, text: '', time: '' });

  useEffect(() => {
    const checkStatus = () => {
      const config = MARKET_CONFIG[market] || MARKET_CONFIG.in;
      const now = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: config.timezone }));
      const hours = local.getHours();
      const minutes = local.getMinutes();
      const day = local.getDay();
      const timeInMinutes = hours * 60 + minutes;
      const marketOpen = config.openH * 60 + config.openM;
      const marketClose = config.closeH * 60 + config.closeM;
      const isWeekday = day >= 1 && day <= 5;
      const isOpen = isWeekday && timeInMinutes >= marketOpen && timeInMinutes <= marketClose;

      const timeStr = local.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone });

      if (!isWeekday) {
        setStatus({ isOpen: false, text: 'Weekend - Market Closed', time: `${config.label} ${timeStr}` });
      } else if (timeInMinutes < marketOpen) {
        const minsToOpen = marketOpen - timeInMinutes;
        const h = Math.floor(minsToOpen / 60);
        const m = minsToOpen % 60;
        setStatus({ isOpen: false, text: `Pre-market - Opens in ${h}h ${m}m`, time: `${config.label} ${timeStr}` });
      } else if (isOpen) {
        const minsToClose = marketClose - timeInMinutes;
        const h = Math.floor(minsToClose / 60);
        const m = minsToClose % 60;
        setStatus({ isOpen: true, text: `Market Open - Closes in ${h}h ${m}m`, time: `${config.label} ${timeStr}` });
      } else {
        setStatus({ isOpen: false, text: 'Market Closed', time: `${config.label} ${timeStr}` });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [market]);

  return (
    <Badge
      variant={status.isOpen ? 'gain' : 'outline'}
      className={cn('h-7 gap-2 px-3', !status.isOpen && 'text-muted-foreground')}
    >
      <span className={cn('size-2 rounded-full', status.isOpen ? 'bg-gain animate-pulse' : 'bg-muted-foreground/60')} aria-hidden="true"></span>
      {status.text}
      <span className="ml-1 text-muted-foreground tabular-nums">{status.time}</span>
    </Badge>
  );
};

const IndexCard = ({ index }) => (
  <StatCard
    label={index.name}
    value={index.price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    change={{ value: index.change, percent: index.change_percent }}
  />
);

const StatCardSkeleton = () => (
  <div className="rounded-xl border border-border bg-card p-4">
    <Skeleton className="h-3 w-20" />
    <Skeleton className="mt-2 h-5 w-28" />
    <Skeleton className="mt-2 h-3 w-24" />
  </div>
);

const sentimentColor = (score) => (score >= 55 ? 'var(--gain)' : score >= 45 ? 'var(--warning)' : 'var(--loss)');

const VIX_SIGNAL_VARIANT = {
  'Extreme Fear': 'loss',
  Fear: 'loss',
  Neutral: 'warning',
  Greed: 'gain',
};

const PriceRangeBar = ({ low, high, current, currencySymbol = '₹' }) => {
  if (!low || !high || !current || high === low) return null;
  const position = Math.min(Math.max(((current - low) / (high - low)) * 100, 0), 100);
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{currencySymbol}{low.toFixed(0)}</span>
        <span className="text-muted-foreground/70">52W Range</span>
        <span>{currencySymbol}{high.toFixed(0)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className="absolute -top-0.5 size-2.5 rounded-full bg-foreground ring-2 ring-card"
          style={{ left: `calc(${position}% - 5px)` }}
        ></div>
      </div>
    </div>
  );
};

const StockCard = ({ stock }) => (
    <Link
      to={`/stock/${stock.symbol}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{stock.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{stock.symbol?.replace('.NS', '')}</div>
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-semibold tabular-nums">
            {stock.currency === 'USD' ? '$' : '₹'}{stock.price?.toLocaleString(stock.currency === 'USD' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <PriceChange percent={stock.change_percent} className="text-xs font-medium" />
        </div>
      </div>
      <PriceRangeBar low={stock.week52_low} high={stock.week52_high} current={stock.price} currencySymbol={stock.currency === 'USD' ? '$' : '₹'} />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>Vol: {formatNumber(stock.volume)}</span>
        <span>MCap: {formatNumber(stock.market_cap)}</span>
      </div>
    </Link>
);

const SkeletonCard = () => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex justify-between">
      <div>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="text-right">
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-3 w-12 ml-auto" />
      </div>
    </div>
    <Skeleton className="mt-3 h-1.5 rounded-full" />
    <div className="mt-2 flex justify-between">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  </div>
);

const NewsCard = ({ article }) => (
  <a
    href={article.url}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex gap-3 rounded-md p-2 transition-colors hover:bg-muted/50"
  >
    {article.image ? (
      <div className="w-20 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
        <img src={article.image} alt="" className="w-full h-full rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
      </div>
    ) : (
      <div className="w-20 h-16 shrink-0 rounded-md bg-muted flex items-center justify-center">
        <Newspaper className="size-6 text-muted-foreground/60" aria-hidden />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-medium line-clamp-2 group-hover:text-foreground dark:group-hover:text-primary transition-colors">{article.title}</h3>
      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
        <span className="font-medium">{article.source}</span>
        <span>{formatDate(article.published_at)}</span>
      </div>
    </div>
  </a>
);

const MoverRow = ({ stock, currency }) => (
  <Link
    to={`/stock/${stock.symbol}`}
    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
  >
    <div className="min-w-0">
      <div className="text-sm font-medium">{stock.symbol?.replace('.NS', '')}</div>
      <div className="truncate text-xs text-muted-foreground">{stock.name}</div>
    </div>
    <div className="shrink-0 text-right">
      <div className="text-sm font-medium tabular-nums">{currency}{stock.price?.toFixed(2)}</div>
      <PriceChange percent={stock.change_percent} className="text-xs font-medium" />
    </div>
  </Link>
);

const SECTORS_BY_MARKET = {
  in: ['All', 'Banking', 'IT', 'Energy', 'Auto', 'FMCG', 'Pharma', 'Metals'],
  us: ['All', 'Tech', 'Finance', 'Healthcare', 'Consumer', 'Energy', 'Industrial'],
};

const STOCK_SECTORS = {
  // India
  'RELIANCE.NS': 'Energy', 'TCS.NS': 'IT', 'HDFCBANK.NS': 'Banking', 'INFY.NS': 'IT',
  'ICICIBANK.NS': 'Banking', 'HINDUNILVR.NS': 'FMCG', 'SBIN.NS': 'Banking', 'BHARTIARTL.NS': 'IT',
  'ITC.NS': 'FMCG', 'KOTAKBANK.NS': 'Banking', 'LT.NS': 'Energy', 'TMCV.NS': 'Auto',
  'AXISBANK.NS': 'Banking', 'BAJFINANCE.NS': 'Banking', 'MARUTI.NS': 'Auto', 'WIPRO.NS': 'IT',
  'ADANIENT.NS': 'Energy', 'TATAPOWER.NS': 'Energy', 'TATASTEEL.NS': 'Metals', 'HCLTECH.NS': 'IT',
  // US
  'AAPL': 'Tech', 'MSFT': 'Tech', 'GOOGL': 'Tech', 'AMZN': 'Consumer', 'NVDA': 'Tech',
  'META': 'Tech', 'TSLA': 'Consumer', 'BRK-B': 'Finance', 'JPM': 'Finance', 'V': 'Finance',
  'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'WMT': 'Consumer', 'MA': 'Finance', 'PG': 'Consumer',
  'HD': 'Consumer', 'DIS': 'Consumer', 'NFLX': 'Tech', 'CRM': 'Tech', 'AMD': 'Tech',
};

const HomePage = () => {
  const { market, currency, marketLabel } = useMarket();
  const [indices, setIndices] = useState([]);
  const [trendingStocks, setTrendingStocks] = useState([]);
  const [loadingIndices, setLoadingIndices] = useState(true);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [activeSector, setActiveSector] = useState('All');
  const [sentiment, setSentiment] = useState(null);
  const [globalIndices, setGlobalIndices] = useState([]);
  const [loadingGlobal, setLoadingGlobal] = useState(true);

  useEffect(() => {
    setLoadingIndices(true);
    setLoadingStocks(true);
    setLoadingNews(true);
    setSentiment(null);
    setActiveSector('All');

    api.get(`/api/stocks/indices?market=${market}`)
      .then((res) => setIndices(res.data.indices || []))
      .catch((err) => console.error('Failed to load indices:', err))
      .finally(() => setLoadingIndices(false));

    api.get(`/api/stocks/trending?market=${market}`)
      .then((res) => {
        const stocks = res.data.stocks || [];
        setTrendingStocks(stocks);
        const sorted = [...stocks].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0));
        setGainers(sorted.filter(s => s.change_percent > 0).slice(0, 5));
        setLosers(sorted.filter(s => s.change_percent < 0).reverse().slice(0, 5));
      })
      .catch((err) => console.error('Failed to load trending:', err))
      .finally(() => setLoadingStocks(false));

    api.get(`/api/stocks/news?market=${market}`)
      .then((res) => setNews((res.data.articles || []).slice(0, 4)))
      .catch((err) => console.error('Failed to load news:', err))
      .finally(() => setLoadingNews(false));

    api.get(`/api/stocks/sentiment?market=${market}`)
      .then((res) => setSentiment(res.data))
      .catch((err) => console.error('Failed to load sentiment:', err));

    // Global indices — always fetched regardless of market toggle
    setLoadingGlobal(true);
    api.get('/api/stocks/indices?market=global')
      .then((res) => setGlobalIndices(res.data.indices || []))
      .catch((err) => console.error('Failed to load global indices:', err))
      .finally(() => setLoadingGlobal(false));
  }, [market]);

  const filteredStocks = activeSector === 'All'
    ? trendingStocks
    : trendingStocks.filter(s => STOCK_SECTORS[s.symbol] === activeSector);

  return (
    <PageContainer>
      {/* Hero */}
      <PageHeader
        title="Markets"
        description={`Search any ${marketLabel} stock for in-depth analysis, financials, and more`}
        actions={<MarketStatus />}
      />
      <StockSearch className="w-full" />

      {/* Market Indices */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Market Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {loadingIndices
            ? [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
            : indices.map((idx) => <IndexCard key={idx.symbol} index={idx} />)
          }
        </div>
      </section>

      {/* Market Sentiment */}
      {sentiment && (
        <SectionCard title="Market Sentiment">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Sentiment Gauge */}
            <div className="text-center">
              <div className="relative w-24 h-24 mx-auto">
                <svg width="96" height="96" className="-rotate-90">
                  <circle cx="48" cy="48" r="38" fill="none" strokeWidth="8" style={{ stroke: 'var(--muted)' }} />
                  <circle cx="48" cy="48" r="38" fill="none"
                    style={{ stroke: sentimentColor(sentiment.score) }}
                    strokeWidth="8"
                    strokeDasharray={`${((Number.isFinite(sentiment.score) ? sentiment.score : 50) / 100) * 2 * Math.PI * 38} ${2 * Math.PI * 38}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold tabular-nums" style={{
                    color: sentimentColor(sentiment.score)
                  }}>{sentiment.score}</span>
                </div>
              </div>
              <div className={cn('text-sm font-semibold mt-1',
                sentiment.overall.includes('Bullish') ? 'text-gain' :
                sentiment.overall.includes('Bearish') ? 'text-loss' : 'text-warning'
              )}>{sentiment.overall}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">Sentiment Score</div>
            </div>

            {/* India VIX */}
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground font-medium">{sentiment.vix?.name || 'VIX'} (Fear Gauge)</div>
              <div className="text-xl font-semibold tabular-nums mt-1">{sentiment.vix?.value?.toFixed(2)}</div>
              <div className={cn('text-xs font-medium tabular-nums', sentiment.vix?.change >= 0 ? 'text-loss' : 'text-gain')}>
                {sentiment.vix?.change >= 0 ? '+' : ''}{sentiment.vix?.change?.toFixed(2)}
              </div>
              <Badge variant={VIX_SIGNAL_VARIANT[sentiment.vix?.signal] || 'gain'} className="mt-1">
                {sentiment.vix?.signal}
              </Badge>
              <div className="text-[10px] text-muted-foreground/70 mt-1">High VIX = High Fear</div>
            </div>

            {/* NIFTY Trend */}
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground font-medium">{sentiment.index?.name || 'Index'} Trend</div>
              <div className="space-y-1.5 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">50 DMA</span>
                  <span className={cn('text-xs font-medium', sentiment.index?.above_50dma ? 'text-gain' : 'text-loss')}>
                    {sentiment.index?.above_50dma ? 'Above' : 'Below'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">200 DMA</span>
                  <span className={cn('text-xs font-medium', sentiment.index?.above_200dma ? 'text-gain' : 'text-loss')}>
                    {sentiment.index?.above_200dma ? 'Above' : 'Below'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">From 52W High</span>
                  <span className="text-xs font-medium tabular-nums text-loss">-{sentiment.index?.pct_from_52w_high}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">From 52W Low</span>
                  <span className="text-xs font-medium tabular-nums text-gain">+{sentiment.index?.pct_from_52w_low}%</span>
                </div>
              </div>
            </div>

            {/* Market Breadth */}
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground font-medium">Market Breadth</div>
              <div className="mt-2">
                <div className="flex h-4 rounded-full overflow-hidden">
                  <div className="bg-gain" style={{ width: `${sentiment.breadth?.pct || 50}%` }}></div>
                  <div className="bg-loss" style={{ width: `${100 - (sentiment.breadth?.pct || 50)}%` }}></div>
                </div>
                <div className="flex justify-between mt-1.5 tabular-nums">
                  <span className="text-xs text-gain font-medium">{sentiment.breadth?.gainers} Advancing</span>
                  <span className="text-xs text-loss font-medium">{sentiment.breadth?.losers} Declining</span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-2">
                Based on {sentiment.breadth?.total} tracked stocks
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Global Markets */}
      <SectionCard title="Global Markets">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {loadingGlobal
            ? [...Array(5)].map((_, i) => <StatCardSkeleton key={i} />)
            : globalIndices.map((idx) => <IndexCard key={idx.symbol} index={idx} />)
          }
        </div>
      </SectionCard>

      {/* Top Gainers & Losers + Latest News side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gainers & Losers */}
        <div className="lg:col-span-2">
          {!loadingStocks && (gainers.length > 0 || losers.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {gainers.length > 0 && (
                <SectionCard
                  title={<span className="flex items-center gap-2"><span className="size-2 rounded-full bg-gain" aria-hidden="true"></span>Top Gainers</span>}
                  contentClassName="p-2"
                >
                  <div className="space-y-0.5">
                    {gainers.map((stock) => (
                      <MoverRow key={stock.symbol} stock={stock} currency={currency} />
                    ))}
                  </div>
                </SectionCard>
              )}

              {losers.length > 0 && (
                <SectionCard
                  title={<span className="flex items-center gap-2"><span className="size-2 rounded-full bg-loss" aria-hidden="true"></span>Top Losers</span>}
                  contentClassName="p-2"
                >
                  <div className="space-y-0.5">
                    {losers.map((stock) => (
                      <MoverRow key={stock.symbol} stock={stock} currency={currency} />
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )}
        </div>

        {/* Latest News */}
        <SectionCard
          title="Latest News"
          action={
            <Link to="/news" className="text-xs font-medium text-foreground dark:text-primary hover:underline">
              View all
            </Link>
          }
          contentClassName="p-2"
        >
          {loadingNews ? (
            <div className="space-y-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3 p-2">
                  <Skeleton className="w-20 h-16 shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-full mb-2" />
                    <Skeleton className="h-3 w-3/4 mb-2" />
                    <Skeleton className="h-2 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {news.map((article, idx) => (
                <NewsCard key={idx} article={article} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Popular Stocks with Sector Filter */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold">Popular Stocks</h2>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {(SECTORS_BY_MARKET[market] || SECTORS_BY_MARKET.in).map((sector) => (
              <button
                key={sector}
                type="button"
                aria-pressed={activeSector === sector}
                onClick={() => setActiveSector(sector)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                  activeSector === sector
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {sector}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {loadingStocks
            ? [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
            : filteredStocks.length > 0
              ? filteredStocks.map((stock) => <StockCard key={stock.symbol} stock={stock} />)
              : (
                <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                  No stocks found in {activeSector} sector
                </div>
              )
          }
        </div>
      </section>

      {/* Quick Links */}
      <SectionCard title="Explore">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(market === 'us'
            ? ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'NFLX', 'AMD']
            : ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TMCV', 'SBIN', 'ITC', 'WIPRO', 'ADANIENT', 'BAJFINANCE']
          ).map((sym) => (
            <Button key={sym} variant="outline" size="sm" asChild>
              <Link to={`/stock/${market === 'us' ? sym : `${sym}.NS`}`}>
                {sym}
              </Link>
            </Button>
          ))}
        </div>
      </SectionCard>
    </PageContainer>
  );
};

export default HomePage;
