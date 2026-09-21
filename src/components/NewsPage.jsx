import React, { useEffect, useState } from 'react';
import { Newspaper, Search, X } from 'lucide-react';
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

const QUICK_STOCKS = {
  in: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TMCV', 'SBIN', 'ITC', 'WIPRO'],
  us: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM'],
};

const NewsPage = () => {
  const { market } = useMarket();
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockInput, setStockInput] = useState('');

  const fetchNews = async (symbol = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = symbol
        ? `/api/stocks/news/${symbol}`
        : `/api/stocks/news?market=${market}`;
      const response = await api.get(endpoint);
      setArticles(response.data.articles || []);
    } catch (err) {
      console.error('Error fetching news:', err);
      setError('Unable to load news. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStockFilter = (e) => {
    e.preventDefault();
    if (stockInput.trim()) {
      const symbol = stockInput.trim().toUpperCase();
      const suffix = market === 'us' ? '' : '.NS';
      const resolved = symbol.includes('.') ? symbol : `${symbol}${suffix}`;
      setStockSymbol(resolved);
      fetchNews(resolved);
    }
  };

  const clearStockFilter = () => {
    setStockSymbol('');
    setStockInput('');
    fetchNews();
  };

  const filteredArticles = articles.filter((article) =>
    !searchTerm ||
    article.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    article.summary?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const sentimentVariant = (label) =>
    label === 'Bullish' ? 'gain' : label === 'Bearish' ? 'loss' : 'warning';

  return (
    <PageContainer>
      <PageHeader title="Market News" description="Latest financial news with sentiment analysis" />

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Text search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
            <Input
              type="text"
              placeholder="Search news..."
              aria-label="Search news"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-9"
            />
          </div>

          {/* Stock-specific news */}
          <form onSubmit={handleStockFilter} className="flex gap-2">
            <Input
              type="text"
              placeholder={market === 'us' ? 'Stock (e.g. AAPL, MSFT)' : 'Stock (e.g. TCS, RELIANCE)'}
              aria-label="Stock symbol"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              className="h-10 w-40 sm:w-48"
            />
            <Button type="submit" className="h-10">
              Filter
            </Button>
          </form>
        </div>

        {/* Active stock filter badge */}
        {stockSymbol && (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
            News for: {stockSymbol}
            <button
              type="button"
              onClick={clearStockFilter}
              className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear stock filter"
            >
              <X className="size-4" aria-hidden />
            </button>
          </Badge>
        )}
      </div>

      {/* Content */}
      {error && (
        <ErrorState message={error} onRetry={() => fetchNews(stockSymbol)} />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <Skeleton className="h-40 w-full rounded-lg mb-2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : filteredArticles.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map((article, idx) => (
            <a
              key={idx}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20"
            >
              {/* Image */}
              {article.image ? (
                <div className="h-40 overflow-hidden bg-muted">
                  <img
                    src={article.image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="h-24 bg-muted/40 flex items-center justify-center">
                  <Newspaper className="size-10 text-muted-foreground/60" aria-hidden />
                </div>
              )}

              {/* Content */}
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/85">{article.source}</span>
                  <span>{formatDate(article.published_at)}</span>
                  {article.sentiment_label && (
                    <Badge variant={sentimentVariant(article.sentiment_label)} className="text-[10px]">
                      {article.sentiment_label}
                    </Badge>
                  )}
                </div>
                <h3 className="text-sm font-medium mb-2 line-clamp-2 underline-offset-4 group-hover:underline">
                  {article.title}
                </h3>
                {article.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-3">{article.summary}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Newspaper}
          title="No articles found"
          description={searchTerm ? 'Try different search terms' : 'No news available at the moment'}
        />
      )}

      {/* Quick stock news links */}
      {!stockSymbol && !isLoading && (
        <SectionCard title="Get news for specific stocks">
          <div className="flex flex-wrap gap-2">
            {(QUICK_STOCKS[market] || QUICK_STOCKS.in).map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  const suffix = market === 'us' ? '' : '.NS';
                  const resolved = `${sym}${suffix}`;
                  setStockInput(sym);
                  setStockSymbol(resolved);
                  fetchNews(resolved);
                }}
                className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {sym}
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </PageContainer>
  );
};

export default NewsPage;
