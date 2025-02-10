import React, { useEffect, useState } from 'react';

const NewsPage = () => {
  const [news, setNews] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const apiKey = process.env.REACT_APP_NEWS_API_KEY;
    const query = 'Indian stock market';
    const url = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&apiKey=${apiKey}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => setNews(data.articles))
      .catch((error) => {
        console.error('Error fetching news:', error);
        setError(error.message);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <main className="flex-1 flex flex-col p-6 gap-6 w-full max-w-4xl">
        <div className="bg-white p-6 rounded-xl shadow-lg w-full">
          <h1 className="text-3xl font-bold mb-6 text-center">
            Latest News from the Indian Stock Market
          </h1>
          {error ? (
            <div className="text-red-500 text-center">{error}</div>
          ) : (
            <ul className="space-y-4">
              {news.map((article, index) => (
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
                  <p className="text-gray-700 mt-2">{article.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default NewsPage;
