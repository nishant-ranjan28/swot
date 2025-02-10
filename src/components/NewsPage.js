import React, { useEffect, useState } from 'react';

const NewsPage = () => {
  const [news, setNews] = useState([]);

  useEffect(() => {
    fetch('https://newsapi.org/v2/everything?q=stock&apiKey=2b9ca35dd4924c50abce5521aa9f3378')
      .then(response => response.json())
      .then(data => setNews(data.articles))
      .catch(error => console.error('Error fetching news:', error));
  }, []);

  return (
    <div>
      <h1>Stock Market News</h1>
      <ul>
        {news.map((article, index) => (
          <li key={index}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.title}
            </a>
            <p>{article.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default NewsPage;