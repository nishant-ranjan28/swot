import React, { useEffect, useState } from 'react';

const NewsPage = () => {
  const [trendingNews, setTrendingNews] = useState([]);
  const [marketUpdates, setMarketUpdates] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const apiKey = process.env.REACT_APP_GNEWS_API_KEY_6;
    if (!apiKey) {
      setError('API key is missing');
      return;
    }

    // Fetch trending news
    const trendingUrl = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=in&topic=business`;
    fetch(trendingUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.articles) {
          setTrendingNews(data.articles);
        } else {
          throw new Error('No trending news found');
        }
      })
      .catch((error) => {
        console.error('Error fetching trending news:', error);
        setError(error.message);
      });

    // Fetch market updates
    const marketUpdatesUrl = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=in&topic=finance`;
    fetch(marketUpdatesUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.articles) {
          setMarketUpdates(data.articles);
        } else {
          throw new Error('No market updates found');
        }
      })
      .catch((error) => {
        console.error('Error fetching market updates:', error);
        setError(error.message);
      });
  }, []);

  let trendingNewsContent;
  if (error) {
    trendingNewsContent = (
      <div className="text-red-500 text-center">{error}</div>
    );
  } else if (trendingNews.length > 0) {
    trendingNewsContent = (
      <ul className="space-y-4">
        {trendingNews.map((article) => (
          <li
            key={article.id}
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
            <p className="text-gray-700 mt-2">{article.description}</p>
            <p className="text-gray-500 mt-1 text-sm">
              {new Date(article.publishedAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    );
  } else {
    trendingNewsContent = (
      <div className="text-gray-500 text-center">
        No trending news available.
      </div>
    );
  }

  let marketUpdatesContent;
  if (error) {
    marketUpdatesContent = (
      <div className="text-red-500 text-center">{error}</div>
    );
  } else if (marketUpdates.length > 0) {
    marketUpdatesContent = (
      <ul className="space-y-4">
        {marketUpdates.map((article) => (
          <li
            key={article.id}
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
            <p className="text-gray-700 mt-2">{article.description}</p>
            <p className="text-gray-500 mt-1 text-sm">
              {new Date(article.publishedAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    );
  } else {
    marketUpdatesContent = (
      <div className="text-gray-500 text-center">
        No market updates available.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <main className="flex-1 flex flex-col p-6 gap-6 w-full max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-6 w-full">
          {/* Left Column: Trending News */}
          <div className="flex-1">
            <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-4">Trending News</h2>
              {trendingNewsContent}
            </div>
          </div>
          {/* Right Column: Market Updates */}
          <div className="w-full lg:w-80">
            <div className="bg-white p-6 rounded-xl shadow-lg">
              <h2 className="text-2xl font-bold mb-4">Market Updates</h2>
              {marketUpdatesContent}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NewsPage;
