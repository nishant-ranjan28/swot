import React, { useEffect, useState } from 'react';

const NewsPage = () => {
  const [trendingNews, setTrendingNews] = useState([]);
  const [marketUpdates, setMarketUpdates] = useState([]);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('trending');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const apiKey = process.env.REACT_APP_GNEWS_API_KEY_6;
    if (!apiKey) {
      setError('API key is missing');
      setIsLoading(false);
      return;
    }

    const fetchNews = async () => {
      try {
        // Fetch trending news
        const trendingUrl = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=in&topic=business`;
        const trendingResponse = await fetch(trendingUrl);

        if (!trendingResponse.ok) {
          throw new Error(`HTTP error! status: ${trendingResponse.status}`);
        }

        const trendingData = await trendingResponse.json();
        if (trendingData.articles) {
          setTrendingNews(trendingData.articles);
        }

        // Fetch market updates
        const marketUpdatesUrl = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=in&topic=finance`;
        const marketResponse = await fetch(marketUpdatesUrl);

        if (!marketResponse.ok) {
          throw new Error(`HTTP error! status: ${marketResponse.status}`);
        }

        const marketData = await marketResponse.json();
        if (marketData.articles) {
          setMarketUpdates(marketData.articles);
        }
      } catch (error) {
        console.error('Error fetching news:', error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNews();
  }, []);

  // Helper function to check if article is new (within 24 hours)
  const isNewArticle = (publishedAt) => {
    const articleDate = new Date(publishedAt);
    const now = new Date();
    const diffInHours = (now - articleDate) / (1000 * 60 * 60);
    return diffInHours <= 24;
  };

  // Filter articles based on search term and filter
  const filterArticles = (articles) => {
    return articles.filter(article => {
      const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.description?.toLowerCase().includes(searchTerm.toLowerCase());

      if (filterBy === 'new') {
        return matchesSearch && isNewArticle(article.publishedAt);
      }

      return matchesSearch;
    });
  };

  const getActiveArticles = () => {
    if (activeTab === 'trending') {
      return filterArticles(trendingNews);
    } else {
      return filterArticles(marketUpdates);
    }
  };

  // Loading skeleton component
  const LoadingSkeleton = () => (
    <div className="space-y-6">
      {[...Array(3)].map((_, index) => (
        <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
      ))}
    </div>
  );

  // News card component
  const NewsCard = ({ article, index }) => (
    <div
      className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out animate-fade-in"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">
            {activeTab === 'trending' ? '🔥' : '📈'}
          </span>
          {isNewArticle(article.publishedAt) && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
              NEW
            </span>
          )}
        </div>
        <time className="text-sm text-gray-500 flex items-center">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {new Date(article.publishedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </time>
      </div>

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group-hover:text-blue-600 transition-colors duration-200"
      >
        <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight group-hover:text-blue-600">
          {article.title}
        </h3>
        <p className="text-gray-600 leading-relaxed mb-4 line-clamp-3">
          {article.description}
        </p>
        <div className="flex items-center text-blue-600 font-medium">
          <span>Read more</span>
          <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </a>
    </div>
  );
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 backdrop-blur-sm bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">📰 News Hub</h1>
              <p className="text-gray-600">Stay updated with the latest business and market news</p>
            </div>

            {/* Search and Filter Section */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search news..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                />
              </div>

              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors duration-200"
              >
                <option value="all">All Articles</option>
                <option value="new">New (24h)</option>
              </select>
            </div>

            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('trending')}
                className={`flex-1 flex items-center justify-center px-4 py-3 rounded-md font-medium transition-all duration-200 ${activeTab === 'trending'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <span className="mr-2">🔥</span>
                Trending News
              </button>
              <button
                onClick={() => setActiveTab('market')}
                className={`flex-1 flex items-center justify-center px-4 py-3 rounded-md font-medium transition-all duration-200 ${activeTab === 'market'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <span className="mr-2">📈</span>
                Market Updates
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error ? (
          <div className="text-center py-12">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading News</h3>
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <LoadingSkeleton />
          </div>
        ) : (
          <>
            {getActiveArticles().length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {getActiveArticles().map((article, index) => (
                  <NewsCard key={article.url || index} article={article} index={index} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
                  <p className="text-gray-500">
                    {searchTerm ? 'Try adjusting your search terms' : 'No articles available at the moment'}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
          opacity: 0;
        }
        
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default NewsPage;
