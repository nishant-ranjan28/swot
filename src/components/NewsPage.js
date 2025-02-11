import React, { useEffect, useState } from 'react';

const NewsPage = () => {
  const [trendingNews, setTrendingNews] = useState([]);
  const [marketUpdates, setMarketUpdates] = useState([]);
  const [error, setError] = useState(null);

  const apiKeys = [
    process.env.REACT_APP_GNEWS_API_KEY_1,
    process.env.REACT_APP_GNEWS_API_KEY_2,
    process.env.REACT_APP_GNEWS_API_KEY_3,
  ];

  const [currentApiKeyIndex, setCurrentApiKeyIndex] = useState(0);

  const getNextApiKey = () => {
    const nextIndex = (currentApiKeyIndex + 1) % apiKeys.length;
    setCurrentApiKeyIndex(nextIndex);
    return apiKeys[nextIndex];
  };

  useEffect(() => {
    const fetchNews = async (url, setState) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          if (
            response.status === 429 ||
            response.status === 401 ||
            response.status === 403
          ) {
            // API limit reached or unauthorized, switch to the next API key
            const newApiKey = getNextApiKey();
            const newUrl = url.replace(apiKeys[currentApiKeyIndex], newApiKey);
            await fetchNews(newUrl, setState);
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.articles) {
          setState(data.articles);
        } else {
          throw new Error('No articles found');
        }
      } catch (error) {
        console.error(`Error fetching news:`, error);
        setError(error.message);
      }
    };

    const apiKey = apiKeys[currentApiKeyIndex];
    const trendingUrl = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=in&topic=business`;
    fetchNews(trendingUrl, setTrendingNews);

    const marketUpdatesUrl = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=in&topic=finance`;
    fetchNews(marketUpdatesUrl, setMarketUpdates);
  }, [currentApiKeyIndex]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <main className="flex-1 flex flex-col p-6 gap-6 w-full max-w-6xl">
        <div className="flex gap-6 w-full">
          {/* Left Column: Trending News */}
          <div className="flex-1">
            <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-4">Trending News</h2>
              {error ? (
                <div className="text-red-500 text-center">{error}</div>
              ) : trendingNews.length > 0 ? (
                <ul className="space-y-4">
                  {trendingNews.map((article, index) => (
                    <li
                      key={index}
                      className="bg-gray-100 p-4 rounded-lg shadow-md hover:bg-gray-200 transition duration-300"
                    >
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xl font-semibold text-blue-600 hover:underline"
                      >
                        {article.title}
                      </a>
                      <p className="text-gray-700 mt-2">
                        {article.description}
                      </p>
                      <p className="text-gray-500 mt-1 text-sm">
                        {new Date(article.publishedAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-500 text-center">
                  No trending news available.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Market Updates */}
          <div className="w-80">
            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h2 className="text-2xl font-bold mb-4">Market Updates</h2>
              {error ? (
                <div className="text-red-500 text-center">{error}</div>
              ) : marketUpdates.length > 0 ? (
                <ul className="space-y-4">
                  {marketUpdates.map((article, index) => (
                    <li
                      key={index}
                      className="bg-gray-100 p-4 rounded-lg shadow-md hover:bg-gray-200 transition duration-300"
                    >
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xl font-semibold text-blue-600 hover:underline"
                      >
                        {article.title}
                      </a>
                      <p className="text-gray-700 mt-2">
                        {article.description}
                      </p>
                      <p className="text-gray-500 mt-1 text-sm">
                        {new Date(article.publishedAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-500 text-center">
                  No market updates available.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NewsPage;
