import React, { useEffect, useState } from 'react';
import api from '../api';

const NewsPage = () => {
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
        : '/api/stocks/news';
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
  }, []);

  const handleStockFilter = (e) => {
    e.preventDefault();
    if (stockInput.trim()) {
      const symbol = stockInput.trim().toUpperCase();
      const resolved = symbol.includes('.') ? symbol : `${symbol}.NS`;
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Market News</h1>
            <p className="text-gray-500">Latest financial news from Yahoo Finance</p>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 max-w-3xl mx-auto">
            {/* Text search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search news..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Stock-specific news */}
            <form onSubmit={handleStockFilter} className="flex gap-2">
              <input
                type="text"
                placeholder="Stock (e.g. TCS, RELIANCE)"
                value={stockInput}
                onChange={(e) => setStockInput(e.target.value)}
                className="w-40 sm:w-48 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Filter
              </button>
            </form>
          </div>

          {/* Active stock filter badge */}
          {stockSymbol && (
            <div className="flex justify-center mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                News for: {stockSymbol}
                <button onClick={clearStockFilter} className="hover:text-blue-900">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center mb-6">
            <p className="text-red-600">{error}</p>
            <button onClick={() => fetchNews(stockSymbol)} className="mt-2 text-sm text-blue-600 underline">Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                <div className="h-40 bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
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
                className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Image */}
                {article.image ? (
                  <div className="h-40 overflow-hidden bg-gray-100">
                    <img
                      src={article.image}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                ) : (
                  <div className="h-24 bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                    <svg className="w-10 h-10 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
                    </svg>
                  </div>
                )}

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {article.source}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(article.published_at)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {article.title}
                  </h3>
                  {article.summary && (
                    <p className="text-xs text-gray-500 line-clamp-3">{article.summary}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No articles found</h3>
            <p className="text-gray-500 text-sm">
              {searchTerm ? 'Try different search terms' : 'No news available at the moment'}
            </p>
          </div>
        )}

        {/* Quick stock news links */}
        {!stockSymbol && !isLoading && (
          <div className="mt-8 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Get news for specific stocks</h3>
            <div className="flex flex-wrap gap-2">
              {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TATAMOTORS', 'SBIN', 'ITC', 'WIPRO'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => { setStockInput(sym); setStockSymbol(`${sym}.NS`); fetchNews(`${sym}.NS`); }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium hover:bg-blue-100 hover:text-blue-700 transition-colors"
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default NewsPage;
