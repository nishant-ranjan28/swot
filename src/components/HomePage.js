import React from 'react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <div>
      <h1>Welcome to the Stock Market App</h1>
      <Link to="/news">
        <button>Show Stock Market News</button>
      </Link>
    </div>
  );
};

export default HomePage;
