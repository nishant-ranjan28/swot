import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const SUBREDDITS = [
  { value: 'IndianStockMarket', label: 'r/IndianStockMarket' },
  { value: 'wallstreetbets', label: 'r/wallstreetbets' },
  { value: 'stocks', label: 'r/stocks' },
  { value: 'investing', label: 'r/investing' },
];

const getSentimentColor = (label) => {
  if (label === 'Bullish') return 'text-green-600 bg-green-50';
  if (label === 'Bearish') return 'text-red-600 bg-red-50';
  return 'text-gray-600 bg-gray-50';
};

const getSentimentBarColor = (score) => {
  if (score > 0.1) return '#16a34a';
  if (score < -0.1) return '#dc2626';
  return '#9ca3af';
};

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
      .then(res => setRedditData(res.data.mentions || []))
      .catch(() => setRedditData([]))
      .finally(() => setLoadingReddit(false));
  }, [activeSub]);

  // Fetch local trending
  useEffect(() => {
    setLoadingLocal(true);
    api.get('/api/social/trending')
      .then(res => setTrendingLocal(res.data.trending || []))
      .catch(() => setTrendingLocal([]))
      .finally(() => setLoadingLocal(false));
  }, []);

  const maxMentions = redditData.length > 0 ? redditData[0].mentions : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trending & Social Sentiment</h1>
        <p className="text-sm text-gray-500 mt-1">Track stock buzz from Reddit and most viewed stocks on StockPulse</p>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('reddit')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'reddit' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Reddit Buzz
        </button>
        <button
          onClick={() => setActiveTab('trending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'trending' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Trending on StockPulse
        </button>
      </div>

      {/* Reddit Tab */}
      {activeTab === 'reddit' && (
        <div className="space-y-4">
          {/* Subreddit Selector */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SUBREDDITS.map(sub => (
              <button
                key={sub.value}
                onClick={() => setActiveSub(sub.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSub === sub.value
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {loadingReddit ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-20" />
              ))}
            </div>
          ) : redditData.length > 0 ? (
            <div className="space-y-3">
              {redditData.map((item, idx) => (
                <div key={item.symbol} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-300 w-6">{idx + 1}</span>
                      <Link
                        to={`/stock/${item.symbol}`}
                        className="text-lg font-bold text-blue-600 hover:text-blue-800"
                      >
                        {item.symbol}
                      </Link>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getSentimentColor(item.sentiment_label)}`}>
                        {item.sentiment_label}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">{item.mentions} mentions</div>
                      <div className="text-xs text-gray-400">sentiment: {item.sentiment?.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Mention bar */}
                  <div className="h-2 bg-gray-100 rounded-full mb-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(item.mentions / maxMentions) * 100}%`,
                        backgroundColor: getSentimentBarColor(item.sentiment),
                      }}
                    />
                  </div>

                  {/* Sample titles */}
                  {item.sample_titles?.length > 0 && (
                    <div className="space-y-1">
                      {item.sample_titles.map((title, i) => (
                        <p key={i} className="text-xs text-gray-500 truncate">
                          "{title}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400">No stock mentions found in {SUBREDDITS.find(s => s.value === activeSub)?.label}</p>
              <p className="text-xs text-gray-300 mt-1">Try a different subreddit or check back later</p>
            </div>
          )}
        </div>
      )}

      {/* Local Trending Tab */}
      {activeTab === 'trending' && (
        <div>
          {loadingLocal ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-12" />
              ))}
            </div>
          ) : trendingLocal.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Most Viewed Stocks Today</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {trendingLocal.map((item, idx) => (
                  <div key={item.symbol} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-300 w-6">{idx + 1}</span>
                      <Link
                        to={`/stock/${item.symbol}`}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {item.symbol}
                      </Link>
                    </div>
                    <span className="text-sm text-gray-500">{item.views} views</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400">No trending data yet</p>
              <p className="text-xs text-gray-300 mt-1">View some stock pages and they'll appear here</p>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-8 text-xs text-gray-400 text-center">
        Reddit data from public subreddits. Sentiment analysis uses VADER NLP.
        Social mentions do not constitute investment advice.
      </div>
    </div>
  );
}

export default TrendingPage;
