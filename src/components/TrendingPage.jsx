import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Flame, MessageSquare } from 'lucide-react';
import api from '../api';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { segmentClass } from '@/lib/segment';
import { cn } from '@/lib/utils';

const SUBREDDITS = [
  { value: 'IndianStockMarket', label: 'r/IndianStockMarket' },
  { value: 'wallstreetbets', label: 'r/wallstreetbets' },
  { value: 'stocks', label: 'r/stocks' },
  { value: 'investing', label: 'r/investing' },
];

const getSentimentVariant = (label) => {
  if (label === 'Bullish') return 'gain';
  if (label === 'Bearish') return 'loss';
  return 'warning';
};

const getSentimentBarClass = (score) => {
  if (score > 0.1) return 'bg-gain';
  if (score < -0.1) return 'bg-loss';
  return 'bg-muted-foreground/50';
};

const LINK_CLASS = 'text-foreground underline-offset-4 hover:underline';

function TrendingPage() {
  const [activeSub, setActiveSub] = useState('IndianStockMarket');
  const [redditData, setRedditData] = useState([]);
  const [loadingReddit, setLoadingReddit] = useState(true);
  const [trendingLocal, setTrendingLocal] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [activeTab, setActiveTab] = useState('reddit');

  // Fetch Reddit mentions
  useEffect(() => {
    setLoadingReddit(true);
    api.get(`/api/social/reddit?sub=${activeSub}`)
      .then(res => setRedditData(res.data.results || []))
      .catch(() => setRedditData([]))
      .finally(() => setLoadingReddit(false));
  }, [activeSub]);

  // Fetch local trending
  useEffect(() => {
    setLoadingLocal(true);
    api.get('/api/social/trending')
      .then(res => setTrendingLocal(res.data.results || []))
      .catch(() => setTrendingLocal([]))
      .finally(() => setLoadingLocal(false));
  }, []);

  const maxMentions = redditData.length > 0 ? redditData[0].mentions : 1;

  return (
    <PageContainer>
      <PageHeader
        title="Trending & Social Sentiment"
        description="Track stock buzz from Reddit and most viewed stocks on StockPulse"
      />

      {/* Tab Toggle */}
      <div className="inline-flex gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="View">
        <button
          type="button"
          aria-pressed={activeTab === 'reddit'}
          onClick={() => setActiveTab('reddit')}
          className={segmentClass(activeTab === 'reddit')}
        >
          Reddit Buzz
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'trending'}
          onClick={() => setActiveTab('trending')}
          className={segmentClass(activeTab === 'trending')}
        >
          Trending on StockPulse
        </button>
      </div>

      {/* Reddit Tab */}
      {activeTab === 'reddit' && (
        <div className="space-y-4">
          {/* Subreddit Selector */}
          <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Subreddit">
            {SUBREDDITS.map(sub => (
              <button
                key={sub.value}
                type="button"
                aria-pressed={activeSub === sub.value}
                onClick={() => setActiveSub(sub.value)}
                className={cn(segmentClass(activeSub === sub.value), 'whitespace-nowrap')}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {loadingReddit ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : redditData.length > 0 ? (
            <div className="space-y-3">
              {redditData.map((item, idx) => (
                <div key={item.symbol} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-lg font-bold text-muted-foreground/50 tabular-nums">{idx + 1}</span>
                      <Link to={`/stock/${item.symbol}`} className={cn('text-lg font-bold', LINK_CLASS)}>
                        {item.symbol}
                      </Link>
                      <Badge variant={getSentimentVariant(item.sentiment_label)}>
                        {item.sentiment_label}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary" className="tabular-nums">{item.mentions} mentions</Badge>
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">sentiment: {item.sentiment?.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Mention bar */}
                  <div className="h-2 bg-muted rounded-full mb-3 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', getSentimentBarClass(item.sentiment))}
                      style={{ width: `${(item.mentions / maxMentions) * 100}%` }}
                    />
                  </div>

                  {/* Sample titles */}
                  {item.sample_titles?.length > 0 && (
                    <div className="space-y-1">
                      {item.sample_titles.map((title, i) => (
                        <p key={i} className="text-xs text-muted-foreground truncate">
                          "{title}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title={`No stock mentions found in ${SUBREDDITS.find(s => s.value === activeSub)?.label}`}
              description="Try a different subreddit or check back later"
            />
          )}
        </div>
      )}

      {/* Local Trending Tab */}
      {activeTab === 'trending' && (
        <div>
          {loadingLocal ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : trendingLocal.length > 0 ? (
            <SectionCard title="Most Viewed Stocks Today" contentClassName="p-0">
              <div className="divide-y divide-border">
                {trendingLocal.map((item, idx) => (
                  <div key={item.symbol} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-sm font-bold text-muted-foreground/50 tabular-nums">{idx + 1}</span>
                      <Link to={`/stock/${item.symbol}`} className={cn('text-sm font-semibold', LINK_CLASS)}>
                        {item.symbol}
                      </Link>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">{item.views} views</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : (
            <EmptyState
              icon={Flame}
              title="No trending data yet"
              description="View some stock pages and they'll appear here"
            />
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center">
        Reddit data from public subreddits. Sentiment analysis uses VADER NLP.
        Social mentions do not constitute investment advice.
      </p>
    </PageContainer>
  );
}

export default TrendingPage;
